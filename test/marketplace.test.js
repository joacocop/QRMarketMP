import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { app } from '../backend/app.js';
import { products } from '../backend/data/products.js';
import { createSelection } from '../frontend/js/selection.js';

let server;
let base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
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
    assert.match(image.headers.get('content-type'), /image\/svg\+xml/);
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

test('la selección acumula cantidades de varios productos', () => {
  const selection = createSelection();
  selection.add(products[0], 2);
  selection.add(products[1], 1);
  selection.add(products[0], 3);
  assert.equal(selection.quantity(products[0].id), 5);
  assert.equal(selection.count(), 6);
  assert.equal(selection.entries().length, 2);
});

test('no se puede superar el stock al agregar repetidamente', () => {
  const selection = createSelection();
  const product = products[0];
  selection.add(product, product.stock - 1);
  assert.throws(() => selection.add(product, 2), /stock disponible/);
  assert.equal(selection.quantity(product.id), product.stock - 1);
  selection.add(product, 1);
  assert.equal(selection.quantity(product.id), product.stock);
  assert.throws(() => selection.add(product, 1), /stock disponible/);
});

test('rechaza cantidades inválidas y productos sin stock', () => {
  const selection = createSelection();
  for (const invalid of [0, -1, 1.5, NaN, Infinity, '2', undefined]) {
    assert.throws(() => selection.add(products[0], invalid), /cantidad entera/);
  }
  assert.throws(() => selection.add(products.find((product) => product.stock === 0), 1), /stock disponible/);
  assert.equal(selection.count(), 0);
});
