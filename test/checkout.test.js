import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { createApp } from '../backend/app.js';
import { products } from '../backend/data/products.js';
import { checkoutItems, checkoutUrl, paymentConfig } from '../backend/checkout.js';
import { createCheckoutSession } from '../frontend/js/checkout.js';

const config = { accessToken: 'TOKEN_SOLO_PARA_PRUEBAS_AUTOMATICAS', origin: 'https://qrmarket.example.com', mode: 'standard' };
const providerResult = {
  id: 'test-preference-123',
  init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=test-preference-123',
  sandbox_init_point: 'https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=test-preference-123',
};
const validBody = () => ({ items: [{ id: products[0].id, quantity: 2 }], buyer: { email: 'buyer@testuser.com' }, checkoutId: randomUUID() });

async function withServer(options, run) {
  const app = createApp({ checkoutOptions: { getConfig: () => config, ...options } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body) => fetch(`${base}/api/create-preference`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try { await run({ base, post }); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}

test('crea preferencia con precios del catálogo y QR que decodifica exactamente al init_point', async () => {
  let captured;
  await withServer({ createPreference: async (input) => { captured = input; return providerResult; } }, async ({ post, base }) => {
    const body = validBody();
    body.items[0].unit_price = 1;
    body.total = 1;
    body.back_urls = { success: 'https://sitio-ajeno.example' };
    body.buyer.email = '  buyer@testuser.com  ';
    const response = await post(body);
    assert.equal(response.status, 200);
    const text = await response.text();
    const data = JSON.parse(text);
    assert.equal(text.includes(config.accessToken), false);
    assert.equal(data.total, products[0].price * 2);
    assert.equal(data.init_point, providerResult.init_point);
    assert.equal(data.currency, 'ARS');
    assert.equal(captured.accessToken, config.accessToken);
    assert.equal(captured.idempotencyKey, body.checkoutId);
    assert.deepEqual(captured.body.items, [{ id: products[0].id, title: products[0].title, quantity: 2, unit_price: products[0].price, currency_id: 'ARS' }]);
    assert.equal(captured.body.payer.email, 'buyer@testuser.com');
    assert.equal(captured.body.back_urls.success, `${config.origin}/checkout/success`);
    assert.equal(captured.body.back_urls.failure, `${config.origin}/checkout/failure`);
    assert.equal(captured.body.back_urls.pending, `${config.origin}/checkout/pending`);
    assert.equal(captured.body.auto_return, 'approved');
    assert.equal(captured.body.external_reference, data.reference);
    assert.equal(captured.body.expires, true);
    assert.ok(Date.parse(data.expires_at) > Date.now());
    const png = PNG.sync.read(Buffer.from(data.qr_image.split(',')[1], 'base64'));
    assert.equal(jsQR(new Uint8ClampedArray(png.data), png.width, png.height).data, data.init_point);
    for (const status of ['success', 'failure', 'pending']) {
      assert.equal((await fetch(`${base}/checkout/${status}`)).status, 200);
    }
  });
});

test('reutiliza la preferencia para el mismo intento, incluso con solicitudes simultáneas', async () => {
  let calls = 0;
  await withServer({ createPreference: async () => { calls++; return providerResult; } }, async ({ post }) => {
    const body = validBody();
    const responses = await Promise.all([post(body), post(body), post(body)]);
    const data = await Promise.all(responses.map((response) => response.json()));
    assert.equal(calls, 1);
    assert.deepEqual(data[0], data[1]);
    assert.deepEqual(data[1], data[2]);
    assert.equal((await post({ ...body, items: [{ id: products[0].id, quantity: 1 }] })).status, 409);
    assert.equal(calls, 1);
  });
});

test('rechaza carritos inválidos antes de llamar a MercadoPago', async () => {
  let calls = 0;
  const soldOut = products.find((product) => !product.stock);
  const invalid = [null, [], 'invalid', [{ id: 'inexistente', quantity: 1 }],
    [{ id: products[0].id, quantity: '1' }], [{ id: products[0].id, quantity: 0 }],
    [{ id: products[0].id, quantity: 1.5 }], [{ id: soldOut.id, quantity: 1 }],
    [{ id: products[0].id, quantity: products[0].stock }, { id: products[0].id, quantity: 1 }],
  ];
  await withServer({ createPreference: async () => { calls++; return providerResult; } }, async ({ post }) => {
    for (const items of invalid) assert.equal((await post({ ...validBody(), items })).status, 422);
    for (const email of ['invalido', 'a@b\r\ncc:other@example.com', 'a'.repeat(255) + '@example.com', 123, {}]) {
      assert.equal((await post({ ...validBody(), buyer: { email } })).status, 422);
    }
    assert.equal((await post({ ...validBody(), checkoutId: 'invalid' })).status, 422);
    assert.equal(calls, 0);
  });
});

test('permite omitir el correo y no inventa un payer para la cuenta de prueba', async () => {
  const sent = [];
  await withServer({ createPreference: async ({ body }) => { sent.push(body); return providerResult; } }, async ({ post }) => {
    for (const buyer of [undefined, {}, { email: '' }, { email: '   ' }]) {
      const response = await post({ ...validBody(), buyer });
      assert.equal(response.status, 200);
    }
    assert.equal(sent.length, 4);
    assert.ok(sent.every((body) => !Object.hasOwn(body, 'payer')));
  });
});

test('agrupar duplicados respeta el stock y conserva el precio de catálogo', () => {
  assert.deepEqual(checkoutItems([{ id: products[0].id, quantity: 1 }, { id: products[0].id, quantity: 2 }]),
    [{ id: products[0].id, title: products[0].title, quantity: 3, unit_price: products[0].price, currency_id: 'ARS' }]);
});

test('sin configuración devuelve disponibilidad falsa y error claro, sin intentar un pago', async () => {
  let calls = 0;
  await withServer({ getConfig: () => paymentConfig({}), createPreference: async () => { calls++; } }, async ({ post, base }) => {
    assert.deepEqual(await (await fetch(`${base}/api/checkout/config`)).json(), { available: false });
    const response = await post(validBody());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'PAYMENTS_NOT_CONFIGURED');
    assert.equal(calls, 0);
  });
});

test('la configuración exige HTTPS público y no expone tokens', async () => {
  for (const origin of ['http://localhost:3000', 'https://localhost', 'https://127.0.0.1', 'https://192.168.1.2', 'https://[::1]', 'http://tienda.example.com', 'https://user:pass@tienda.example.com', 'https://tienda.local', 'https://tienda.example.com/subpath', 'https://tienda.example.com?token=1']) {
    assert.throws(() => paymentConfig({ MP_ACCESS_TOKEN: 'fake', PUBLIC_BASE_URL: origin }));
  }
  const env = { MP_ACCESS_TOKEN: 'fake', PUBLIC_BASE_URL: config.origin };
  assert.equal(paymentConfig(env).mode, 'standard');
  assert.equal(paymentConfig({ ...env, MP_CHECKOUT_MODE: 'sandbox' }).mode, 'sandbox');
  assert.throws(() => paymentConfig({ ...env, MP_CHECKOUT_MODE: 'unknown' }));
  await withServer({}, async ({ base }) => {
    assert.deepEqual(await (await fetch(`${base}/api/checkout/config`)).json(), { available: true });
  });
});

test('sandbox elige explícitamente sandbox_init_point para checkout y QR', async () => {
  await withServer({ getConfig: () => ({ ...config, mode: 'sandbox' }), createPreference: async () => providerResult }, async ({ post }) => {
    const data = await (await post(validBody())).json();
    assert.equal(data.init_point, providerResult.sandbox_init_point);
    const png = PNG.sync.read(Buffer.from(data.qr_image.split(',')[1], 'base64'));
    assert.equal(jsQR(new Uint8ClampedArray(png.data), png.width, png.height).data, providerResult.sandbox_init_point);
  });
});

test('errores de proveedor y timeouts no filtran respuestas ni credenciales', async () => {
  for (const timeout of [false, true]) {
    await withServer({ createPreference: async () => {
      const error = new Error(`Authorization: Bearer ${config.accessToken}`);
      if (timeout) error.name = 'AbortError';
      throw error;
    } }, async ({ post }) => {
      const response = await post(validBody());
      assert.equal(response.status, timeout ? 504 : 502);
      assert.equal((await response.text()).includes(config.accessToken), false);
    });
  }
});

test('reintenta una caída conservando referencia, contenido y clave de idempotencia', async () => {
  const calls = [];
  await withServer({ createPreference: async (input) => {
    calls.push(input);
    if (calls.length === 1) throw new Error('network');
    return providerResult;
  } }, async ({ post }) => {
    const body = validBody();
    assert.equal((await post(body)).status, 502);
    const response = await post(body);
    assert.equal(response.status, 200);
    assert.deepEqual(calls[0], calls[1]);
    assert.equal((await response.json()).reference, calls[0].body.external_reference);
  });
});

test('rechaza enlaces ajenos a MercadoPago, respuestas incompletas y protocolos inseguros', async () => {
  for (const url of ['https://mercadopago.com.ar.evil.example/pagar', 'https://evil.example', 'http://www.mercadopago.com.ar', 'javascript:alert(1)', 'https://user:pass@www.mercadopago.com.ar']) assert.throws(() => checkoutUrl(url));
  for (const result of [{ ...providerResult, init_point: 'https://evil.example' }, { ...providerResult, id: undefined }]) {
    await withServer({ createPreference: async () => result }, async ({ post }) => {
      const response = await post(validBody());
      assert.equal(response.status, 502);
      assert.equal((await response.json()).code, 'INVALID_PROVIDER_RESPONSE');
    });
  }
});

test('JSON inválido o demasiado grande se rechaza con error controlado', async () => {
  await withServer({}, async ({ base }) => {
    for (const [body, expected] of [['{bad', 400], [JSON.stringify({ extra: 'x'.repeat(17000) }), 413]]) {
      const response = await fetch(`${base}/api/create-preference`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      assert.equal(response.status, expected);
      assert.ok((await response.json()).error);
    }
  });
});

test('el SDK oficial envía el token sólo en Authorization y el cuerpo esperado a la API', async (t) => {
  const nativeFetch = globalThis.fetch;
  let sdkCalls = 0;
  let timeout = false;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (!String(url).startsWith('https://api.mercadopago.com/')) return nativeFetch(url, options);
    sdkCalls++;
    if (timeout) throw new DOMException('Operation aborted', 'AbortError');
    assert.match(String(url), /\/checkout\/preferences\/?$/);
    assert.equal(options.headers.Authorization, `Bearer ${config.accessToken}`);
    assert.ok(options.headers['X-Idempotency-Key']);
    assert.equal(JSON.parse(options.body).items[0].unit_price, products[0].price);
    return new Response(JSON.stringify(providerResult), { status: 201, headers: { 'Content-Type': 'application/json' } });
  });
  await withServer({}, async ({ post }) => {
    const response = await post(validBody());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).preference_id, providerResult.id);
    assert.equal(sdkCalls, 1);
    timeout = true;
    assert.equal((await post(validBody())).status, 504);
    assert.equal(sdkCalls, 2);
  });
});

const paymentFixture = async () => ({
  preference_id: providerResult.id, init_point: providerResult.init_point,
  qr_image: await QRCode.toDataURL(providerResult.init_point), reference: 'QRM-test',
  total: products[0].price * 2, currency: 'ARS', expires_at: new Date(Date.now() + 1800000).toISOString(),
});
const clientItems = () => [{ product: products[0], quantity: 2 }];

test('el navegador reutiliza la preferencia al alternar QR y redirección', async () => {
  let calls = 0;
  const fixture = await paymentFixture();
  const session = createCheckoutSession({ getItems: clientItems, request: async () => {
    calls++; return new Response(JSON.stringify(fixture));
  } });
  const [first, second] = await Promise.all([session.prepare('buyer@testuser.com'), session.prepare('buyer@testuser.com')]);
  assert.deepEqual(first, second);
  assert.deepEqual(await session.prepare('buyer@testuser.com'), fixture);
  assert.equal(calls, 1);
});

test('un cambio de carrito mientras llega la preferencia impide usarla', async () => {
  let items = clientItems();
  let resolve;
  const fixture = await paymentFixture();
  const session = createCheckoutSession({ getItems: () => items, request: () => new Promise((done) => { resolve = done; }) });
  const pending = session.prepare('buyer@testuser.com');
  items = [{ product: products[0], quantity: 1 }];
  session.invalidate();
  resolve(new Response(JSON.stringify(fixture)));
  await assert.rejects(pending, /carrito cambió/);
});

test('la expiración y un cambio de correo generan intentos nuevos', async () => {
  let clock = Date.now();
  const ids = [];
  const fixture = await paymentFixture();
  const session = createCheckoutSession({ getItems: clientItems, now: () => clock, request: async (_url, options) => {
    ids.push(JSON.parse(options.body).checkoutId);
    return new Response(JSON.stringify({ ...fixture, expires_at: new Date(clock + 1000).toISOString() }));
  } });
  await session.prepare('buyer@testuser.com');
  clock += 2000;
  await session.prepare('buyer@testuser.com');
  await session.prepare('other@testuser.com');
  assert.equal(new Set(ids).size, 3);
});

test('el navegador permite reintentar errores y rechaza una respuesta de pago manipulada', async () => {
  let calls = 0;
  const ids = [];
  const fixture = await paymentFixture();
  const session = createCheckoutSession({ getItems: clientItems, request: async (_url, options) => {
    ids.push(JSON.parse(options.body).checkoutId);
    calls++;
    if (calls === 1) return new Response(JSON.stringify({ error: 'MercadoPago no está disponible.' }), { status: 503 });
    return new Response(JSON.stringify(fixture));
  } });
  await assert.rejects(session.prepare('buyer@testuser.com'), /no está disponible/);
  assert.deepEqual(await session.prepare('buyer@testuser.com'), fixture);
  assert.equal(ids[0], ids[1]);
  const invalid = createCheckoutSession({ getItems: clientItems, request: async () => new Response(JSON.stringify({ ...fixture, init_point: 'https://evil.example' })) });
  await assert.rejects(invalid.prepare('buyer@testuser.com'));
});
