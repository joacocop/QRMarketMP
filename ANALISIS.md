# QRMarket MP: análisis y seguimiento

## Alcance acordado

Trabajar en esta carpeta por requisitos: QM1, luego QM2 y así sucesivamente. Se pueden agrupar varios QM cuando el usuario lo indique. Después de QM1 y QM2, el usuario pidió una paleta café/beige/crema, productos reales e implementar QM3 y QM4 juntos.

Fuente: PDF «Marketplace con Generación de QR + Carrito de Compras + Integración MercadoPago», de 16 páginas, fechado el 04/11/2026. Los requisitos funcionales están en las páginas 12 y 13; la evaluación y los entregables, en las páginas 14 a 16.

La carpeta estaba vacía al comenzar la revisión.

## Requisitos y criterios de finalización

**Implementados: QM1, QM2, QM3 y QM4.** QM5 a QM12 siguen pendientes. La columna de verificación traduce la consigna en comprobaciones propuestas para cada etapa.

| ID | Requisito del PDF | Cómo comprobar que está resuelto |
| --- | --- | --- |
| QM1 | Catálogo de productos | Se ve una grilla de productos con imagen, título, precio y stock. |
| QM2 | Página de producto | Se abre el detalle de un producto con imagen, descripción, selector de cantidad y botón «Agregar al carrito». La incorporación efectiva y persistente se completa en QM4. |
| QM3 | Generación de QR por producto | Cada producto tiene un QR escaneable que lleva a su página o a su checkout directo. |
| QM4 | Carrito de compras | Permite agregar, eliminar y modificar cantidades; conserva el contenido al recargar mediante localStorage. |
| QM5 | Checkout con MercadoPago | El botón solicita una preferencia al backend y redirige al init_point devuelto. Se verifica el flujo con credenciales de prueba. |
| QM6 | Pago con QR | Permite mostrar un QR que contiene el init_point de la preferencia para continuar el pago desde otro dispositivo. |
| QM7 | Webhooks | Un endpoint recibe notificaciones, valida la firma que corresponda al flujo elegido, consulta el pago y actualiza el estado de la orden. Evita aplicar dos veces una misma notificación. |
| QM8 | Cupones de descuento | Un código válido aplica el porcentaje configurado y se refleja en los totales. Los códigos inválidos se rechazan. |
| QM9 | Cálculo de envío | Se calcula el costo según código postal u opciones configuradas, o se aplica envío gratis al alcanzar el mínimo definido. |
| QM10 | Dashboard de vendedor | Muestra productos, ventas realizadas y estados de las órdenes. |
| QM11 | Órdenes persistidas | Las órdenes se guardan en una base de datos, por ejemplo SQLite, MongoDB o Firestore, y sobreviven al reinicio del servidor. |
| QM12 | Autenticación básica | El vendedor puede iniciar sesión mediante JWT o sesión simple; el acceso a su información se controla también en el backend. |

## Dependencias para avanzar en orden

- QM1 define los datos básicos de productos que reutilizan QM2, QM3 y QM4.
- QM2 permite agregar productos; QM4 completa la edición, eliminación y persistencia del carrito.
- Para probar QM3 con un celular, la URL de destino debe ser accesible desde ese dispositivo. Una dirección localhost del equipo no alcanza para esa prueba.
- QM5 utiliza los productos y cantidades del carrito. Los precios y totales definitivos se calculan y validan en el backend.
- QM6 reutiliza la preferencia creada para QM5. El QR por producto de QM3 y el QR de pago de QM6 cumplen funciones distintas.
- QM7 necesita una orden identificable y una referencia que vincule esa orden con el pago. Si seguimos estrictamente la numeración, se puede usar almacenamiento temporal hasta incorporar la base de datos en QM11; antes de esa etapa no se considerará persistencia definitiva.
- QM8 y QM9 deben integrarse también con el cálculo del cobro en el backend, además de mostrarse en el carrito.
- QM10 puede visualizar órdenes del almacenamiento disponible y pasar a consultar la base definitiva en QM11.
- QM12 incorpora la protección de los recursos del vendedor antes de considerar listo el despliegue final.

## Tecnologías mencionadas en la consigna

- Backend: Node.js con Express.
- Frontend: React/Next.js o JavaScript sin framework.
- Pagos: SDK de MercadoPago y Checkout Pro.
- QR: QRCode.js o la biblioteca qrcode.
- Desarrollo de webhooks: una URL pública, con Ngrok como opción propuesta.
- Despliegue: alternativas como Render, Vercel y Netlify.

Se eligió Node.js con Express para el servidor y JavaScript sin framework para el frontend. La base de datos todavía no se eligió. Los fragmentos de código del PDF sirven como ejemplos didácticos: al implementar MercadoPago se contrastarán las llamadas y la validación de notificaciones con su documentación oficial vigente.

## Evaluación y entregables

### Avance parcial: 60 %

La evaluación continua contempla participación y conexión durante la clase. El avance técnico solicitado incluye:

- Backend con endpoint /create-preference funcionando.
- Frontend con carrito básico y botón que redirige al pago.
- Un QR visible, aunque sea de prueba.
- Variables de entorno, separación de rutas y manejo básico de errores.
- Entrega mediante ZIP o enlace a repositorio/Drive, más capturas de carrito, QR y redirección.
- El PDF también solicita compartir el enlace de Live Share en la plataforma de clase.

### Entrega final: 40 %

- Al menos 8 de los 12 QM.
- Checkout Pro con un pago aprobado en el entorno de pruebas.
- Webhooks recibidos y procesados, con evidencia en logs.
- Generación de QR para producto o pago.
- Carrito con persistencia, cupones y cálculo de envío.
- Backend y frontend desplegados con URLs funcionales.
- Código con variables de entorno, validaciones y manejo adecuado de errores.
- Repositorio público con README, video de demostración de 2 a 3 minutos e informe técnico en PDF o Markdown.
- El informe debe describir objetivos, arquitectura, decisiones, flujo de pago, capturas, dificultades, soluciones, conclusiones y enlaces.
- Se solicitan ambas versiones: avance parcial y entrega final.

El PDF dice «martes siguiente» para la entrega final; no indica allí una fecha numérica. Cumplir 8 QM no sustituye las demás condiciones de evaluación.

Las publicaciones, entregas en plataformas y configuración de servicios externos se realizarán cuando el usuario las solicite. Las instrucciones académicas del PDF son contexto de la consigna, no una autorización para ejecutar esas acciones ahora.

## Cuidados de implementación

- Mantener el Access Token exclusivamente en el backend mediante variables de entorno.
- Entregar .env.example con valores de ejemplo; excluir credenciales reales y node_modules de las entregas.
- No tomar una redirección exitosa del navegador como confirmación definitiva de un pago: consultar su estado desde el backend.
- Validar productos, cantidades, stock, cupones, envío y montos en el servidor.
- Procesar notificaciones repetidas sin duplicar cambios en ventas u órdenes.
- Distinguir un QR que abre una URL de Checkout Pro de una integración nativa de QR de MercadoPago. La consigna admite generar el QR con la URL de pago para este proyecto.

## Próximo paso

QM1 resuelto: grilla de ocho modelos reales con fotografías locales, título, precio en ARS y stock de demostración. Incluye búsqueda, categorías, orden y estados vacíos/de error. Paleta café, beige y crema.

QM2 resuelto: URL de detalle por producto, descripción, características, selector de cantidad limitado por stock y botón «Agregar al carrito». Cada detalle enlaza a la ficha oficial del fabricante.

QM3 resuelto: QR por producto desde tarjetas y detalle, URL visible y descarga PNG. Admite PUBLIC_BASE_URL en .env para direcciones accesibles desde otro dispositivo. Los ocho QR se decodificaron automáticamente y apuntan al producto correspondiente.

QM4 resuelto: página /carrito con edición de cantidades, eliminación, vaciado, subtotal y contador. Persiste en localStorage, sincroniza pestañas, valida datos al restaurar y ajusta cantidades frente al stock actual. Avisa si el navegador no permite guardar.

Validación: 16 pruebas automáticas aprobadas y recorrido de navegador en computadora y anchos de 390/320 px. QR descargado y decodificado; carrito probado tras recarga, entre pestañas y ante almacenamiento corrupto/bloqueado. Las instrucciones están en README.md y las fuentes de los productos en PRODUCTOS.md.

Próximo requisito, cuando el usuario lo indique: QM5, checkout con MercadoPago.
