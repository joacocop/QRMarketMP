# QRMarket MP

Marketplace desarrollado por requisitos, según la consigna del proyecto. Implementados: **QM1 a QM6**. Diseño en tonos café, beige y crema, con ocho modelos reales y fotografías guardadas en el proyecto.

El checkout y el QR de pago están implementados. **Se creó una preferencia con la cuenta vendedora de prueba sin correo y se confirmó por API el pago completado por el usuario: `approved` / `accredited`.** El QR coincide con el enlace recibido y la página de regreso es accesible. Ver [MERCADOPAGO.md](MERCADOPAGO.md) para la configuración y el recorrido.

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
- **QM5:** correo opcional y botón que solicita una preferencia al backend mediante el SDK oficial y redirige a MercadoPago. El comprador puede identificarse directamente en MercadoPago sin inventar un correo. El servidor valida productos, cantidades y stock, y toma los precios del catálogo.
- **QM6:** opción de mostrar y descargar un QR de pago con el mismo enlace de checkout, importe y vencimiento. Ambos botones reutilizan la preferencia mientras el carrito y el correo no cambien.
- Navegación sin recarga, historial del navegador, enlaces directos y estado de producto inexistente.

El carrito guarda únicamente IDs y cantidades bajo la clave `qrmarket.cart.v1`; los precios se toman del catálogo. Al restaurarlo, descarta productos eliminados, agotados o datos inválidos, agrupa duplicados y limita las cantidades al stock actual. Si el almacenamiento está bloqueado o lleno, sigue funcionando en memoria e informa que podría perderse al recargar. Las preferencias de pago se crean sólo después de configurar MercadoPago. La confirmación por webhooks y las órdenes persistidas se incorporarán en QM7 y QM11.

## QR y acceso desde el celular

Cada QR lleva a `/productos/:id`. Por defecto se usa la dirección con la que se accedió al servidor. Para probar con un celular, ambos dispositivos pueden estar en la misma Wi-Fi: abrir la tienda usando la IP local de la computadora, por ejemplo `http://192.168.1.20:3000`, y generar el QR desde esa dirección. El servidor escucha en las interfaces disponibles; la configuración de red/firewall del equipo debe permitir el acceso.

También se puede copiar `.env.example` a `.env` y definir:

```dotenv
PORT=3000
PUBLIC_BASE_URL=https://tu-direccion-publica.example
```

`npm start` y `npm run dev` cargan `.env` automáticamente si existe. Reiniciar el servidor después de cambiarlo. Usar una dirección pública real o una IP accesible por el dispositivo; `localhost` del celular apunta al propio celular. La interfaz avisa cuando el QR está usando localhost. **El QR de producto (QM3) puede usar la IP local; el checkout de QM5/QM6 requiere PUBLIC_BASE_URL con un dominio público HTTPS.** El QR de pago contiene el enlace de MercadoPago, no la URL del producto.

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
11. Configurar [MercadoPago](MERCADOPAGO.md) y elegir «Pagar con MercadoPago» o «Pagar con QR». El correo es opcional y puede dejarse vacío; el comprador inicia sesión dentro de MercadoPago. Si faltan credenciales o la dirección pública, se muestra un mensaje sin perder el carrito.
12. Cerrar el QR y abrirlo otra vez: reutiliza la preferencia. Cambiar el carrito invalida el pago preparado. El QR deja de ofrecer el enlace cuando vence.
13. Las páginas `/checkout/success`, `/checkout/failure` y `/checkout/pending` conservan el carrito. No confirman un cobro por parámetros de la URL.

Pruebas automáticas de endpoints, imágenes, archivos privados, carrito, almacenamiento y lectura real de los QR:

```powershell
npm test
```

Verificación acumulada: **33 pruebas automáticas aprobadas**. Incluyen lectura de los QR de producto y pago, preferencias sin correo, validación del importe en servidor, rechazo de datos inválidos, credenciales no expuestas, reintentos y solicitudes simultáneas. Los tests automáticos ejercitan el SDK interceptando su llamada HTTP, sin contactar a MercadoPago.

En Chrome se probó el flujo con proveedor simulado: correo opcional, checkout/QR compartidos, descarga y decodificación, redirección al destino esperado, recuperación de errores, cambios del carrito durante la solicitud o desde otra pestaña, vencimiento y retornos manipulados. Capturas revisadas en escritorio y móvil, sin desbordes a 390/320 px ni errores JavaScript. Además, se creó una preferencia con una cuenta vendedora de prueba en los servidores de MercadoPago y se verificó su QR. El usuario completó una compra y se confirmó por API el estado `approved` / `accredited`, con la página de regreso respondiendo HTTP 200. **La confirmación automática dentro de la tienda corresponde a QM7. No se realizó un escaneo físico del QR desde un celular.**

## Organización

```text
backend/
  app.js                API y archivos públicos
  server.js             Inicio del servidor
  product-qr.js         Generación de URL y QR PNG
  checkout.js           Preferencias MercadoPago, validación y QR de pago
  data/products.js      Modelos reales con precios/stock de demostración
frontend/
  index.html            Estructura compartida
  styles.css            Diseño adaptable
  js/app.js             Catálogo, detalle, carrito, QR y navegación
  js/cart.js            Estado, validación y persistencia del carrito
  js/checkout.js        Solicitud, reutilización y vencimiento del checkout
  assets/products/      Fotografías locales del catálogo
test/
  marketplace.test.js    Pruebas automáticas
  checkout.test.js       Pruebas de pagos y SDK con proveedor simulado
ANALISIS.md              Consigna y seguimiento de QM
PRODUCTOS.md             Fichas oficiales y procedencia de fotos
MERCADOPAGO.md           Configuración y prueba de QM5/QM6
```

## API disponible

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | `/api/products` | `{ products: [...] }` |
| GET | `/api/products/:id` | `{ product: {...} }` o error 404 |
| GET | `/api/products/:id/qr` | `{ productId, url, qrImage }` con imagen PNG en base64 |
| GET | `/api/products/:id/qr.png` | PNG descargable con el QR del producto |
| GET | `/api/checkout/config` | `{ available }`, sin credenciales |
| POST | `/api/create-preference` | Preferencia, enlace de pago, importe, vencimiento y QR |

Las rutas de productos y archivos públicos utilizan [Express](https://expressjs.com/en/starter/static-files/). Se publica únicamente la carpeta `frontend`.

## Siguiente etapa

QM7: webhooks para confirmar pagos y actualizar órdenes. Los demás requisitos se incorporarán cuando el usuario los indique. Ver `ANALISIS.md` para el detalle completo.
