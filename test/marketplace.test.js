import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { app } from '../backend/app.js';
import { products } from '../backend/data/products.js';
import { createCart, CART_STORAGE_KEY } from '../frontend/js/cart.js';
import { productUrl } from '../backend/product-qr.js';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

let server;
let base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('el catálogo publica datos completos y todas las imágenes existen', async () => {
  const response = await fetch(`${base}/api/products`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.products.length, 8);
  assert.equal(new Set(data.products.map((product) => product.id)).size, data.products.length);
  for (const product of data.products) {
    assert.ok(product.title && product.description && product.features.length);
    assert.ok(Number.isSafeInteger(product.price) && product.price > 0);
    assert.ok(Number.isSafeInteger(product.stock) && product.stock >= 0);
    const image = await fetch(base + product.image);
    assert.equal(image.status, 200);
    assert.match(image.headers.get('content-type'), /image\/(jpeg|png)/);
    assert.ok((await image.arrayBuffer()).byteLength > 0);
    assert.ok(product.brand && new URL(product.sourceUrl).protocol === 'https:');
  }
});

test('cada producto tiene API de detalle y URL directa recargable', async () => {
  for (const product of products) {
    const response = await fetch(`${base}/api/products/${product.id}`);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).product, product);
    const page = await fetch(`${base}/productos/${product.id}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<script type="module" src="\/js\/app.js"><\/script>/);
  }
});

test('un producto inexistente devuelve 404 en API y página', async () => {
  const response = await fetch(`${base}/api/products/inexistente`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Producto no encontrado.' });
  assert.equal((await fetch(`${base}/productos/inexistente`)).status, 404);
});

test('los archivos del backend y la configuración no son públicos', async () => {
  for (const path of ['/backend/data/products.js', '/package.json', '/.env', '/.env.example', '/ANALISIS.md']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
  assert.equal((await fetch(`${base}/`)).status, 200);
});

test('el carrito acumula cantidades y calcula subtotales con los precios del catálogo', () => {
  const cart = createCart(products);
  cart.add(products[0].id, 2);
  cart.add(products[1].id, 1);
  cart.add(products[0].id, 3);
  assert.equal(cart.quantity(products[0].id), 5);
  assert.equal(cart.count(), 6);
  assert.equal(cart.items().length, 2);
  assert.equal(cart.subtotal(), products[0].price * 5 + products[1].price);
});

test('no se puede superar el stock al agregar repetidamente', () => {
  const selection = createCart(products);
  const product = products[0];
  selection.add(product.id, product.stock - 1);
  assert.throws(() => selection.add(product.id, 2), /stock disponible/);
  assert.equal(selection.quantity(product.id), product.stock - 1);
  selection.add(product.id, 1);
  assert.equal(selection.quantity(product.id), product.stock);
  assert.throws(() => selection.add(product.id, 1), /stock disponible/);
});

test('rechaza cantidades inválidas y productos sin stock', () => {
  const selection = createCart(products);
  for (const invalid of [0, -1, 1.5, NaN, Infinity, '2', undefined]) {
    assert.throws(() => selection.add(products[0].id, invalid), /cantidad entera/);
  }
  assert.throws(() => selection.add(products.find((product) => product.stock === 0).id, 1), /stock disponible/);
  assert.equal(selection.count(), 0);
});

function memoryStorage(raw = null) {
  const data = new Map(raw === null ? [] : [[CART_STORAGE_KEY, raw]]);
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test('editar, eliminar y vaciar actualiza los totales y lo guardado', () => {
  const storage = memoryStorage();
  const cart = createCart(products, { storage });
  cart.add(products[0].id, 2);
  cart.add(products[1].id, 3);
  cart.setQuantity(products[0].id, 4);
  assert.equal(cart.subtotal(), products[0].price * 4 + products[1].price * 3);
  assert.throws(() => cart.setQuantity(products[0].id, 0), /cantidad entera/);
  assert.throws(() => cart.setQuantity(products[0].id, products[0].stock + 1), /stock disponible/);
  cart.remove(products[0].id);
  assert.equal(cart.count(), 3);
  assert.equal(createCart(products, { storage }).count(), 3);
  cart.clear();
  assert.equal(cart.subtotal(), 0);
  assert.equal(createCart(products, { storage }).count(), 0);
});

test('restaura el carrito después de recargar sin confiar en precios almacenados', () => {
  const storage = memoryStorage(JSON.stringify({ version: 1, items: [{ id: products[0].id, quantity: 2, price: 1 }] }));
  const cart = createCart(products, { storage });
  assert.equal(cart.count(), 2);
  assert.equal(cart.subtotal(), products[0].price * 2);
  assert.deepEqual(JSON.parse(storage.getItem(CART_STORAGE_KEY)), { version: 1, items: [{ id: products[0].id, quantity: 2 }] });
});

test('reconcilia stock reducido, productos eliminados, duplicados e ítems inválidos', () => {
  const storage = memoryStorage(JSON.stringify({ version: 1, items: [
    { id: products[0].id, quantity: 100 }, { id: products[0].id, quantity: 2 },
    { id: 'producto-eliminado', quantity: 1 }, { id: products[1].id, quantity: 1.5 },
    { id: products.find((product) => product.stock === 0).id, quantity: 1 }, null,
  ] }));
  const cart = createCart(products, { storage });
  assert.equal(cart.count(), products[0].stock);
  assert.equal(cart.items().length, 1);
});

test('un almacenamiento corrupto o con versión desconocida no rompe el carrito', () => {
  for (const raw of ['{oops', 'null', '[]', '{"version":99,"items":[]}', '{"version":1,"items":{}}']) {
    const cart = createCart(products, { storage: memoryStorage(raw) });
    assert.equal(cart.count(), 0);
    cart.add(products[0].id, 1);
    assert.equal(cart.count(), 1);
  }
});

test('si el navegador bloquea el guardado, el carrito funciona y avisa', () => {
  let notices = 0;
  const storage = { getItem() { throw new Error('Bloqueado'); }, setItem() { throw new Error('Sin espacio'); } };
  const cart = createCart(products, { storage, onStorageError() { notices++; } });
  cart.add(products[0].id, 1);
  assert.equal(cart.count(), 1);
  assert.ok(notices > 0);
});

test('permite sincronizar cambios de otra pestaña sin reescribir el carrito', () => {
  const storage = memoryStorage();
  const first = createCart(products, { storage });
  const second = createCart(products, { storage });
  first.add(products[0].id, 3);
  second.reload();
  assert.equal(second.count(), 3);
  second.clear();
  first.reload();
  assert.equal(first.count(), 0);
});

test('todos los QR se decodifican y apuntan a la página de su producto', async () => {
  for (const product of products) {
    const response = await fetch(`${base}/api/products/${product.id}/qr`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.url, productUrl(product.id, base));
    const png = PNG.sync.read(Buffer.from(data.qrImage.split(',')[1], 'base64'));
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    assert.ok(decoded, 'El QR debe poder leerse.');
    assert.equal(decoded.data, data.url);
    assert.equal((await fetch(data.url)).status, 200);
  }
});

test('la descarga devuelve un PNG y los QR inexistentes devuelven 404', async () => {
  const response = await fetch(`${base}/api/products/${products[0].id}/qr.png`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /image\/png/);
  assert.match(response.headers.get('content-disposition'), /attachment/);
  const png = PNG.sync.read(Buffer.from(await response.arrayBuffer()));
  assert.equal(png.width, 400);
  for (const path of ['/qr', '/qr.png']) assert.equal((await fetch(`${base}/api/products/inexistente${path}`)).status, 404);
  assert.equal((await fetch(`${base}/carrito`)).status, 200);
});

test('el QR acepta una dirección pública configurada y rechaza protocolos ajenos a la web', () => {
  assert.equal(productUrl('sony-wh-ch520', base, 'https://tienda.example'), 'https://tienda.example/productos/sony-wh-ch520');
  assert.equal(productUrl('sony-wh-ch520', base, 'http://192.168.1.20:3000'), 'http://192.168.1.20:3000/productos/sony-wh-ch520');
  for (const origin of ['javascript:alert(1)', 'ftp://example.com', 'https://user:pass@example.com']) {
    assert.throws(() => productUrl('sony-wh-ch520', base, origin));
  }
});
