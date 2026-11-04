# QRMarket MP

Marketplace de demostración desarrollado por requisitos, según la consigna del proyecto. Implementados: **QM1 y QM2**.

## Ejecutar

Requiere Node.js 22 o superior y npm. Desde esta carpeta:

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

Las imágenes, estilos y scripts son locales; no requieren servicios externos ni credenciales. La instalación inicial sí descarga Express. Los precios, stock y características son datos ficticios para demostrar el proyecto.

## Qué incluye

- **QM1:** catálogo adaptable a computadora y celular, con ocho productos, imagen, título, precio en ARS y stock; búsqueda sin distinción de tildes, filtros por categoría y orden por precio o nombre; estados de carga, error y búsqueda sin resultados.
- **QM2:** página propia por producto con imagen, descripción, características, precio, stock, selector de cantidad y botón «Agregar al carrito»; límites por stock, estado de producto agotado, confirmación al agregar y vista de la selección actual.
- Navegación sin recarga, historial del navegador, enlaces directos y estado de producto inexistente.

El botón de QM2 agrega a una **selección temporal en memoria**, que se mantiene al navegar dentro de la aplicación. Al recargar la página se reinicia. El carrito con edición, eliminación y persistencia en `localStorage` corresponde a **QM4** y todavía no está implementado. No se crean órdenes ni pagos en esta etapa.

## Cómo probar

1. Abrir el catálogo y revisar imagen, nombre, precio y stock de cada tarjeta.
2. Buscar `lampara`, filtrar por una categoría y cambiar el orden de precios. Probar una búsqueda sin coincidencias y restablecer los filtros.
3. Abrir **Auriculares Nube**, aumentar la cantidad y presionar «Agregar al carrito». Ver la confirmación y abrir «Tu selección» en la cabecera para revisar las unidades y el subtotal.
4. Repetir la incorporación hasta agotar el stock disponible para la selección. El formulario debe impedir agregar más unidades. También se rechazan cero, decimales y cantidades mayores al límite.
5. Abrir **Cámara Instante**: el producto está agotado y el botón está deshabilitado.
6. Abrir directamente `/productos/auriculares-nube` y recargar. El detalle debe seguir visible. Abrir `/productos/inexistente` para comprobar el estado 404.
7. Reducir el ancho de la ventana o usar un celular para revisar la distribución.

Pruebas automáticas de los endpoints, imágenes, archivos privados y límites de stock:

```powershell
npm test
```

Verificación de esta etapa: siete pruebas automáticas aprobadas y recorrido en Chrome de catálogo, búsqueda, filtros, orden, detalle, selección, stock agotado, cantidades inválidas, historial, recarga y producto inexistente. Se revisaron capturas de computadora y celular, y se comprobó que no haya desbordes a 390 y 320 px ni errores de JavaScript.

## Organización

```text
backend/
  app.js                API y archivos públicos
  server.js             Inicio del servidor
  data/products.js      Productos de demostración
frontend/
  index.html            Estructura compartida
  styles.css            Diseño adaptable
  js/app.js             Catálogo, detalle y navegación
  js/selection.js       Selección temporal y validación de cantidades
  assets/               Ilustraciones SVG locales
test/
  marketplace.test.js    Pruebas automáticas
ANALISIS.md              Consigna y seguimiento de QM
```

## API disponible

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | `/api/products` | `{ products: [...] }` |
| GET | `/api/products/:id` | `{ product: {...} }` o error 404 |

Las rutas de productos y archivos públicos utilizan [Express](https://expressjs.com/en/starter/static-files/). Se publica únicamente la carpeta `frontend`.

## Siguiente etapa

QM3: generar un QR por producto. Los demás requisitos se incorporarán cuando el usuario los indique. Ver `ANALISIS.md` para el detalle completo.
