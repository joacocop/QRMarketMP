import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { products } from './data/products.js';
import { productQR } from './product-qr.js';
import { createCheckoutRouter } from './checkout.js';

const publicDirectory = fileURLToPath(new URL('../frontend/', import.meta.url));
export function createApp({ checkoutOptions } = {}) {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/products', (_req, res) => res.json({ products }));
  app.get('/api/products/:id', (req, res) => {
    const product = products.find((item) => item.id === req.params.id);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado.' });
    res.json({ product });
  });
  app.get(['/api/products/:id/qr', '/api/products/:id/qr.png'], async (req, res) => {
    const product = products.find((item) => item.id === req.params.id);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado.' });
    const { url, image } = await productQR(product.id, `${req.protocol}://${req.get('host')}`);
    res.set('Cache-Control', 'no-store');
    if (req.path.endsWith('.png')) {
      return res.attachment(`${product.id}-qr.png`).type('png').send(image);
    }
    res.json({ productId: product.id, url, qrImage: `data:image/png;base64,${image.toString('base64')}` });
  });
  app.use('/api', createCheckoutRouter(checkoutOptions));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Recurso no encontrado.' }));

  // Se expone únicamente frontend; el código del servidor y .env quedan fuera.
  app.use(express.static(publicDirectory, { index: false }));
  app.get(['/', '/productos/:id', '/carrito', '/checkout/success', '/checkout/failure', '/checkout/pending'], (req, res) => {
    if (req.params.id && !products.some((item) => item.id === req.params.id)) {
      res.status(404);
    }
    res.sendFile(path.join(publicDirectory, 'index.html'));
  });
  app.use((_req, res) => res.status(404).type('text').send('Página no encontrada.'));
  app.use((error, _req, res, _next) => {
    const status = [400, 413].includes(error.status) ? error.status : 500;
    res.status(status).json({ error: status === 413 ? 'La solicitud es demasiado grande.' : 'No pudimos procesar la solicitud.' });
  });
  return app;
}

export const app = createApp();
