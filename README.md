# QRMarket MP

Marketplace desarrollado por requisitos, según la consigna del proyecto. Implementados: **QM1, QM2, QM3 y QM4**. Diseño en tonos café, beige y crema, con ocho modelos reales y fotografías guardadas en el proyecto.

## Ejecutar

Requiere Node.js 22.9 o superior y npm. Desde esta carpeta:

```powershell
npm install
npm start
```

Abrir [http://localhost:3000](http://localhost:3000). Para reiniciar automáticamente el servidor al editar el backend, usar `npm run dev`.

Si el puerto está ocupado, se puede elegir otro en PowerShell:

```powershell
$env:PORT = '3001'
npm start
```

Las imágenes, estilos y scripts son locales; no requieren servicios externos ni credenciales para navegar. La instalación inicial descarga las dependencias. Los modelos, las fotos y las características corresponden a productos reales; **los precios en ARS y el stock son ficticios** para demostrar el proyecto. Las fuentes están en [PRODUCTOS.md](PRODUCTOS.md) y cada detalle enlaza a la ficha del fabricante.

## Qué incluye

- **QM1:** catálogo adaptable a computadora y celular, con ocho productos, imagen, título, precio en ARS y stock; búsqueda sin distinción de tildes, filtros por categoría y orden por precio o nombre; estados de carga, error y búsqueda sin resultados.
- **QM2:** página propia por producto con imagen, descripción, características, precio, stock, selector de cantidad y botón «Agregar al carrito»; límites por stock, estado de producto agotado y confirmación al agregar.
- **QM3:** QR único por URL de producto, visible desde cada tarjeta y desde el detalle; descarga en PNG, enlace de destino visible y opción de configurar una dirección pública.
- **QM4:** página `/carrito` con cantidades editables, eliminación de productos, vaciado, subtotales y contador; persistencia en `localStorage` y sincronización entre pestañas del mismo navegador.
- Navegación sin recarga, historial del navegador, enlaces directos y estado de producto inexistente.

El carrito guarda únicamente IDs y cantidades bajo la clave `qrmarket.cart.v1`; los precios se toman del catálogo. Al restaurarlo, descarta productos eliminados, agotados o datos inválidos, agrupa duplicados y limita las cantidades al stock actual. Si el almacenamiento está bloqueado o lleno, sigue funcionando en memoria e informa que podría perderse al recargar. No se crean órdenes ni pagos en esta etapa.

## QR y acceso desde el celular

Cada QR lleva a `/productos/:id`. Por defecto se usa la dirección con la que se accedió al servidor. Para probar con un celular, ambos dispositivos pueden estar en la misma Wi-Fi: abrir la tienda usando la IP local de la computadora, por ejemplo `http://192.168.1.20:3000`, y generar el QR desde esa dirección. El servidor escucha en las interfaces disponibles; la configuración de red/firewall del equipo debe permitir el acceso.

También se puede copiar `.env.example` a `.env` y definir:

```dotenv
PORT=3000
PUBLIC_BASE_URL=https://tu-direccion-publica.example
```

`npm start` y `npm run dev` cargan `.env` automáticamente si existe. Reiniciar el servidor después de cambiarlo. Usar una dirección pública real o una IP accesible por el dispositivo; `localhost` del celular apunta al propio celular. La interfaz avisa cuando el QR está usando localhost. Este QR es de producto; el QR de pago se implementará en QM6.

## Cómo probar

1. Abrir el catálogo y revisar imagen, nombre, precio y stock de cada tarjeta.
2. Buscar `lampara`, filtrar por una categoría y cambiar el orden de precios. Probar una búsqueda sin coincidencias y restablecer los filtros.
3. Abrir **Auriculares WH-CH520**, elegir dos unidades y presionar «Agregar al carrito». Abrir «Tu carrito» y comprobar el subtotal de $179.800.
4. Cambiar la cantidad con los botones o el campo numérico. Comprobar que se rechacen cero, decimales y cantidades mayores al stock. El detalle descuenta las unidades que ya están en el carrito del máximo que se puede agregar.
5. Recargar y cerrar/reabrir la pestaña: el carrito debe mantenerse. Abrir otra pestaña y modificarlo para comprobar la sincronización.
6. Agregar otro producto, eliminar uno y vaciar el carrito. Comprobar los totales y el estado vacío.
7. Abrir **Cámara Instax mini 12**: está agotada y no permite agregar unidades.
8. Usar el botón QR de una tarjeta o «Ver QR del producto» en el detalle. Revisar la URL, descargar el PNG y escanearlo desde un dispositivo que tenga acceso a esa dirección.
9. Abrir directamente `/productos/sony-wh-ch520` y `/carrito`, y recargar. Abrir `/productos/inexistente` para comprobar el estado 404.
10. Reducir el ancho de la ventana o usar un celular para revisar la distribución.

Pruebas automáticas de endpoints, imágenes, archivos privados, carrito, almacenamiento y lectura real de los QR:

```powershell
npm test
```

Verificación de esta etapa: **16 pruebas automáticas aprobadas**. Se decodificaron los ocho QR y se verificó la descarga PNG. Recorrido en Chrome de catálogo, filtros, detalle, cantidades inválidas, límites acumulados, edición/eliminación/vaciado, recarga, dos pestañas, almacenamiento bloqueado o corrupto y error/reintento de QR. Se revisaron capturas y se comprobó que no haya desbordes a 390 y 320 px ni errores de JavaScript. No se realizó una prueba física con un celular en la red del usuario.

## Organización

```text
backend/
  app.js                API y archivos públicos
  server.js             Inicio del servidor
  product-qr.js         Generación de URL y QR PNG
  data/products.js      Modelos reales con precios/stock de demostración
frontend/
  index.html            Estructura compartida
  styles.css            Diseño adaptable
  js/app.js             Catálogo, detalle, carrito, QR y navegación
  js/cart.js            Estado, validación y persistencia del carrito
  assets/products/      Fotografías locales del catálogo
test/
  marketplace.test.js    Pruebas automáticas
ANALISIS.md              Consigna y seguimiento de QM
PRODUCTOS.md             Fichas oficiales y procedencia de fotos
```

## API disponible

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | `/api/products` | `{ products: [...] }` |
| GET | `/api/products/:id` | `{ product: {...} }` o error 404 |
| GET | `/api/products/:id/qr` | `{ productId, url, qrImage }` con imagen PNG en base64 |
| GET | `/api/products/:id/qr.png` | PNG descargable con el QR del producto |

Las rutas de productos y archivos públicos utilizan [Express](https://expressjs.com/en/starter/static-files/). Se publica únicamente la carpeta `frontend`.

## Siguiente etapa

QM5: checkout con MercadoPago. Los demás requisitos se incorporarán cuando el usuario los indique. Ver `ANALISIS.md` para el detalle completo.
