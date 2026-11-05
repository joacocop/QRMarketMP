import { Router, json } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import QRCode from 'qrcode';
import { products } from './data/products.js';

const PAYMENT_TTL = 30 * 60 * 1000;
const checkoutHosts = new Set([
  'www.mercadopago.com.ar', 'sandbox.mercadopago.com.ar',
  'www.mercadopago.com', 'sandbox.mercadopago.com',
]);

export class CheckoutError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function paymentConfig(env = process.env) {
  const unavailable = () => new CheckoutError(503, 'PAYMENTS_NOT_CONFIGURED',
    'Los pagos todavía no están disponibles. Tu carrito sigue guardado.');
  const accessToken = env.MP_ACCESS_TOKEN?.trim();
  if (!accessToken || !env.PUBLIC_BASE_URL?.trim()) throw unavailable();
  let base;
  try { base = new URL(env.PUBLIC_BASE_URL.trim()); }
  catch { throw unavailable(); }
  const host = base.hostname.toLowerCase();
  if (base.protocol !== 'https:' || base.username || base.password || base.port
    || !host.includes('.') || isIP(host) || host.startsWith('[')
    || /(^|\.)(localhost|local|test|invalid)$/.test(host)
    || base.pathname !== '/' || base.search || base.hash) throw unavailable();
  const mode = env.MP_CHECKOUT_MODE || 'standard';
  if (!['standard', 'sandbox'].includes(mode)) throw unavailable();
  return { accessToken, origin: base.origin, mode };
}

export function checkoutItems(items, catalog = products) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    throw new CheckoutError(422, 'INVALID_CART', 'Agregá productos válidos a tu carrito antes de pagar.');
  }
  const inventory = new Map(catalog.map((product) => [product.id, product]));
  const quantities = new Map();
  for (const item of items) {
    const product = inventory.get(item?.id);
    if (!product) throw new CheckoutError(422, 'INVALID_PRODUCT', 'Uno de los productos ya no está disponible. Revisá tu carrito.');
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new CheckoutError(422, 'INVALID_QUANTITY', 'Las cantidades deben ser números enteros mayores a cero.');
    }
    const quantity = (quantities.get(product.id) || 0) + item.quantity;
    if (!Number.isSafeInteger(quantity) || quantity > product.stock) {
      throw new CheckoutError(422, 'INSUFFICIENT_STOCK', `No hay stock suficiente de ${product.title}. Revisá tu carrito.`);
    }
    quantities.set(product.id, quantity);
  }
  return [...quantities].sort(([a], [b]) => a.localeCompare(b)).map(([id, quantity]) => {
    const product = inventory.get(id);
    return { id, title: product.title, quantity, unit_price: product.price, currency_id: 'ARS' };
  });
}

export function checkoutUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && checkoutHosts.has(url.hostname)
      && !url.username && !url.password && !url.port) return url.href;
  } catch { /* Una respuesta inválida no debe convertirse en una redirección. */ }
  throw new CheckoutError(502, 'INVALID_PROVIDER_RESPONSE', 'MercadoPago no devolvió un enlace de pago válido. Intentá de nuevo.');
}

async function createMercadoPagoPreference({ body, accessToken, idempotencyKey }) {
  // Cliente por operación: las opciones de una petición no se comparten con otra.
  const client = new MercadoPagoConfig({ accessToken, options: { timeout: 10000, maxRetries: 0 } });
  return new Preference(client).create({ body, requestOptions: { idempotencyKey } });
}

export function createCheckoutRouter({
  catalog = products,
  getConfig = paymentConfig,
  createPreference = createMercadoPagoPreference,
  now = Date.now,
} = {}) {
  const router = Router();
  // Reutiliza preferencias durante esta ejecución. No es almacenamiento de órdenes (QM11).
  const requests = new Map();

  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/checkout/config', (_req, res) => {
    try { getConfig(); res.json({ available: true }); }
    catch { res.json({ available: false }); }
  });

  router.post('/create-preference', json({ limit: '16kb' }), async (req, res) => {
    try {
      const items = checkoutItems(req.body?.items, catalog);
      const rawEmail = req.body?.buyer?.email;
      const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';
      if ((rawEmail != null && typeof rawEmail !== 'string')
        || (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))) {
        throw new CheckoutError(422, 'INVALID_EMAIL', 'Ingresá un correo electrónico válido para continuar.');
      }
      const requestId = req.body?.checkoutId;
      if (typeof requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId)) {
        throw new CheckoutError(422, 'INVALID_CHECKOUT_ID', 'No pudimos identificar el intento de compra. Volvé a intentarlo.');
      }
      const config = getConfig();
      const fingerprint = createHash('sha256').update(JSON.stringify({ items, email, config })).digest('hex');
      const time = now();
      for (const [key, entry] of requests) if (entry.expires <= time) requests.delete(key);
      const previous = requests.get(requestId);
      if (previous && previous.fingerprint !== fingerprint) {
        throw new CheckoutError(409, 'CHECKOUT_CHANGED', 'El carrito cambió. Volvé a iniciar el pago.');
      }
      if (!previous && requests.size >= 500) {
        throw new CheckoutError(429, 'CHECKOUT_BUSY', 'Estamos procesando muchos intentos de pago. Probá nuevamente en unos minutos.');
      }

      let entry = previous;
      if (!entry) {
        const expires = time + PAYMENT_TTL;
        const reference = `QRM-${randomUUID()}`;
        const body = {
          items,
          ...(email ? { payer: { email } } : {}),
          back_urls: {
            success: `${config.origin}/checkout/success`,
            failure: `${config.origin}/checkout/failure`,
            pending: `${config.origin}/checkout/pending`,
          },
          auto_return: 'approved',
          external_reference: reference,
          expires: true,
          expiration_date_from: new Date(time - 60000).toISOString(),
          expiration_date_to: new Date(expires).toISOString(),
        };
        entry = { fingerprint, expires, body, reference };
        requests.set(requestId, entry);
      }
      if (!entry.promise) {
        // Se guarda la promesa antes de esperar para cubrir solicitudes simultáneas.
        entry.promise = (async () => {
          const preference = await createPreference({ body: entry.body, accessToken: config.accessToken, idempotencyKey: requestId });
          const url = checkoutUrl(config.mode === 'sandbox' ? preference.sandbox_init_point : preference.init_point);
          if (typeof preference.id !== 'string' || !preference.id || preference.id.length > 200) {
            throw new CheckoutError(502, 'INVALID_PROVIDER_RESPONSE', 'No pudimos preparar el pago. Intentá de nuevo.');
          }
          return {
            preference_id: preference.id,
            init_point: url,
            reference: entry.reference,
            total: items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0),
            currency: 'ARS',
            expires_at: new Date(entry.expires).toISOString(),
          };
        })();
      }
      let payment;
      const pending = entry.promise;
      try { payment = await pending; }
      catch (error) {
        // Una caída del generador de QR no vuelve a crear la preferencia.
        if (entry.promise === pending) entry.promise = null;
        throw error;
      }
      const qrImage = await QRCode.toDataURL(payment.init_point, {
        width: 400, margin: 4, errorCorrectionLevel: 'M',
        color: { dark: '#4b3026ff', light: '#ffffffff' },
      });
      res.json({ ...payment, qr_image: qrImage });
    } catch (error) {
      if (error instanceof CheckoutError) return res.status(error.status).json({ error: error.message, code: error.code });
      // No registrar respuestas completas del proveedor, correos ni credenciales.
      const timeout = /timeout|timed out|abort|ETIMEDOUT/i.test([
        error?.name, error?.code, error?.cause?.name, error?.cause?.code,
        error?.__cause__?.name, error?.__cause__?.code,
      ].join(' '));
      console.warn('No se pudo crear la preferencia en MercadoPago. Estado:', Number(error?.status) || 'no disponible');
      res.status(timeout ? 504 : 502).json({
        error: timeout ? 'MercadoPago tardó demasiado en responder. Intentá de nuevo.' : 'No pudimos conectar con MercadoPago. Intentá de nuevo en unos momentos.',
        code: timeout ? 'PAYMENT_TIMEOUT' : 'PAYMENT_PROVIDER_ERROR',
      });
    }
  });
  return router;
}
