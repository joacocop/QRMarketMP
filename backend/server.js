import { app } from './app.js';

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`QRMarket MP disponible en http://localhost:${port}`);
});
server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? `El puerto ${port} está ocupado. Elegí otro con la variable PORT.`
    : error.message);
  process.exitCode = 1;
});
