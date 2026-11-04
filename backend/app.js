import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { products } from './data/products.js';

const publicDirectory = fileURLToPath(new URL('../frontend/', import.meta.url));
export const app = express();
app.disable('x-powered-by');

app.get('/api/products', (_req, res) => res.json({ products }));
app.get('/api/products/:id', (req, res) => {
  const product = products.find((item) => item.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado.' });
  res.json({ product });
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'Recurso no encontrado.' }));

// Se expone únicamente frontend; el código del servidor y .env quedan fuera.
app.use(express.static(publicDirectory, { index: false }));
app.get(['/', '/productos/:id'], (req, res) => {
  if (req.params.id && !products.some((item) => item.id === req.params.id)) {
    res.status(404);
  }
  res.sendFile(path.join(publicDirectory, 'index.html'));
});
app.use((_req, res) => res.status(404).type('text').send('Página no encontrada.'));
app.use((error, _req, res, _next) => {
  console.error(error.message);
  res.status(error.status === 400 ? 400 : 500).json({ error: 'No pudimos procesar la solicitud.' });
});
