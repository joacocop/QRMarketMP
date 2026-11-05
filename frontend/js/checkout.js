function checkoutId() {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  // getRandomValues también funciona al abrir el proyecto por HTTP en una red local.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function validPaymentUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && ['www.mercadopago.com.ar', 'sandbox.mercadopago.com.ar', 'www.mercadopago.com', 'sandbox.mercadopago.com'].includes(url.hostname);
  } catch { return false; }
}

export function createCheckoutSession({ getItems, request = fetch, now = Date.now }) {
  let attempt = null;
  const snapshot = () => getItems().map(({ product, quantity }) => ({
    id: product.id, quantity, price: product.price,
  })).sort((a, b) => a.id.localeCompare(b.id));

  return {
    invalidate() { attempt = null; },
    async prepare(email = '') {
      const items = snapshot();
      if (!items.length) throw new Error('Tu carrito está vacío. Agregá productos para continuar.');
      const fingerprint = JSON.stringify({ items, email: email.trim() });
      if (!attempt || attempt.fingerprint !== fingerprint || now() - attempt.createdAt >= 1800000
        || (attempt.payment && Date.parse(attempt.payment.expires_at) <= now())) {
        attempt = { id: checkoutId(), fingerprint, createdAt: now() };
      }
      const current = attempt;
      if (current.payment) return current.payment;
      if (!current.pending) {
        current.pending = (async () => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          try {
            const response = await request('/api/create-preference', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
              body: JSON.stringify({
                items: items.map(({ id, quantity }) => ({ id, quantity })),
                ...(email.trim() ? { buyer: { email: email.trim() } } : {}),
                checkoutId: current.id,
              }),
            });
            const data = await response.json();
            if (!response.ok) {
              if (['CHECKOUT_CHANGED', 'INVALID_CHECKOUT_ID'].includes(data.code) && attempt === current) attempt = null;
              const error = new Error(data.error || 'No pudimos preparar el pago. Intentá de nuevo.');
              error.checkoutError = true;
              throw error;
            }
            if (!validPaymentUrl(data.init_point) || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(data.qr_image)
              || !Number.isFinite(data.total) || data.total <= 0 || data.currency !== 'ARS'
              || !Number.isFinite(Date.parse(data.expires_at)) || Date.parse(data.expires_at) <= now()) {
              throw new Error('Respuesta de pago inválida.');
            }
            if (attempt !== current || JSON.stringify({ items: snapshot(), email: email.trim() }) !== fingerprint) {
              const error = new Error('El carrito cambió mientras preparábamos el pago. Revisalo y volvé a intentarlo.');
              error.checkoutError = true;
              throw error;
            }
            current.payment = data;
            return data;
          } catch (error) {
            if (error.checkoutError) throw error;
            throw new Error(error.name === 'AbortError'
              ? 'El pago tardó demasiado en prepararse. Intentá de nuevo.'
              : 'No pudimos preparar el pago. Revisá tu conexión e intentá de nuevo.');
          } finally { clearTimeout(timeout); current.pending = null; }
        })();
      }
      return current.pending;
    },
  };
}
