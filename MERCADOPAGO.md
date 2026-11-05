# MercadoPago: QM5 y QM6

La integración utiliza Checkout Pro vía Preferences API, como pide la consigna. El backend usa el SDK oficial `mercadopago`; el navegador se redirige al checkout alojado por MercadoPago o muestra un QR con la misma URL. No se cargan formularios de tarjeta ni credenciales del vendedor en el frontend.

**Estado actual:** código implementado y 33 pruebas automáticas aprobadas. Se configuró la URL pública y se verificó la credencial de una cuenta vendedora de prueba argentina. MercadoPago creó una preferencia sin correo del comprador; se decodificó su QR y coincide con el enlace del checkout. El usuario completó una compra y se consultó el pago por API: estado `approved`, detalle `accredited`. La página de regreso respondió HTTP 200.

## 1. Preparar la cuenta

En [Tus integraciones](https://www.mercadopago.com.ar/developers/panel/app), crear o seleccionar una aplicación para Checkout Pro y obtener el Access Token que corresponda al entorno/cuenta de prueba indicado por MercadoPago. El token se configura únicamente en `.env` del servidor.

Preparar una cuenta de comprador de prueba distinta de la cuenta vendedora. MercadoPago describe dónde encontrar esas cuentas y sus datos en su [guía de integración de prueba](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/integration-test).

## 2. Dar una dirección pública al proyecto

La tienda puede seguir funcionando localmente, pero el checkout necesita `PUBLIC_BASE_URL` con **un origen público HTTPS**, sin rutas, usuario, contraseña ni parámetros. MercadoPago no admite localhost en sus URLs de retorno. Ver [configuración oficial de URLs de retorno](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/configure-back-urls).

Para desarrollo se puede usar un túnel al puerto 3000. Si Ngrok ya está instalado y configurado:

```powershell
ngrok http 3000
```

Copiar la dirección HTTPS que devuelva. Esa dirección debe llevar a este servidor, no a otra aplicación. Mantener el túnel abierto durante la prueba.

## 3. Configurar `.env`

Si todavía no existe `.env`, copiar `.env.example` y completar:

```dotenv
PORT=3000
PUBLIC_BASE_URL=https://tu-dominio-publico.ngrok-free.app
MP_ACCESS_TOKEN=ACCESS_TOKEN_DE_TU_APLICACION_DE_PRUEBA
MP_CHECKOUT_MODE=standard
```

Los valores de arriba son ejemplos: reemplazar el dominio y el token por los propios. `.env` ya está excluido de Git. Si ya existe, conservar sus otros valores al editarlo.

- `standard` usa `init_point`, el enlace estándar devuelto por la preferencia.
- `sandbox` selecciona explícitamente `sandbox_init_point` cuando el entorno de pruebas que estés usando requiera ese enlace.
- La selección del enlace **no convierte una cuenta real en una cuenta de prueba**. Usar las cuentas y credenciales apropiadas según el panel y la documentación de MercadoPago.

Iniciar o reiniciar el servidor:

```powershell
npm start
```

`npm start` y `npm run dev` cargan `.env`. Si cambia el dominio del túnel, actualizar `PUBLIC_BASE_URL` y reiniciar el servidor.

## 4. Probar desde el carrito

1. Abrir la tienda, agregar productos y entrar en «Tu carrito».
2. Dejar vacío el correo del carrito si la cuenta de prueba no muestra uno. El campo es opcional: no hay que inventar un email. Si se completa, debe tener un formato válido.
3. Elegir «Pagar con MercadoPago». El backend valida el carrito y crea la preferencia; el navegador abre su `init_point`.
4. En MercadoPago, iniciar sesión con el usuario y la contraseña del comprador de prueba y completar el checkout con los medios de pago de prueba indicados por MercadoPago. Se recomienda una sesión de incógnito para evitar mezclar las cuentas de comprador y vendedor.
5. Para probar QM6, volver al carrito y elegir «Pagar con QR». Escanear desde el celular o usar «Abrir MercadoPago». «Descargar QR» guarda el PNG del mismo enlace.

Los datos vigentes de tarjetas y escenarios están en [Realizar compras de prueba](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/integration-test/test-purchases). La guía incluye, por ejemplo, el titular `APRO` para simular aprobación y otros valores para rechazo o pendiente. Usar los datos publicados allí, sin una tarjeta real.

El QR de QM6 abre la URL de Checkout Pro. No es un QR bancario interoperable ni una integración de punto de venta. Cada preferencia tiene una ventana de 30 minutos. Cambiar productos, cantidades o correo genera un nuevo intento. Si el carrito cambia mientras se prepara el pago, la aplicación impide usar la respuesta anterior.

## Retorno y confirmación

Las preferencias configuran estas páginas bajo `PUBLIC_BASE_URL`:

- `/checkout/success`
- `/checkout/failure`
- `/checkout/pending`

Al volver a un dominio gratuito de Ngrok desde una sesión nueva, puede aparecer su aviso `ERR_NGROK_6024` con un botón «Visit Site». Pulsarlo permite continuar a la tienda; esa pantalla no determina el resultado del pago ni requiere repetir la compra. Ver [explicación oficial de Ngrok](https://ngrok.com/docs/errors/err_ngrok_6024).

**Ninguna página confirma un cobro a partir de la URL.** Incluso si recibe `status=approved`, conserva el carrito y no marca una orden como pagada. El resultado se consulta en MercadoPago; la confirmación automática mediante webhooks se implementará en QM7 y la base de datos de órdenes, en QM11.

Las preferencias se reutilizan en memoria durante el mismo intento para que mostrar el QR y redirigir no creen dos preferencias. Los reintentos conservan su clave de idempotencia, referencia y contenido. Este registro temporal no es una base de datos ni una orden persistida; se pierde al reiniciar el servidor.

## API de esta etapa

`GET /api/checkout/config` devuelve únicamente `{ "available": true }` o `{ "available": false }`, sin revelar tokens. La disponibilidad indica configuración presente y válida; no prueba que MercadoPago haya aceptado esas credenciales.

`POST /api/create-preference` recibe:

```json
{
  "items": [{ "id": "sony-wh-ch520", "quantity": 2 }],
  "buyer": { "email": "correo-del-comprador-de-prueba@example.com" },
  "checkoutId": "b3389ad2-8a68-4017-adc6-2844c0281458"
}
```

El navegador genera un UUID por intento. `buyer.email` es opcional; si falta o está vacío, no se incluye `payer` en la preferencia y el comprador se identifica en MercadoPago. Si se completa, se valida. El servidor usa exclusivamente los precios y nombres del catálogo, agrupa duplicados, valida cantidades y stock, y crea una preferencia en ARS. Ignora precios, totales o URLs de retorno que el cliente intente enviar.

La respuesta contiene `preference_id`, `init_point`, `reference`, `total`, `currency`, `expires_at` y `qr_image` (PNG en base64). Las credenciales se usan sólo en la llamada del servidor al SDK.

| Estado HTTP | Causa habitual |
| --- | --- |
| 400 / 413 | JSON inválido o solicitud demasiado grande |
| 422 | Productos, cantidades, stock, correo o UUID inválidos |
| 409 | Se reutilizó el mismo intento con un carrito o correo diferente |
| 429 | Se alcanzó el límite temporal de intentos del servidor |
| 503 | Falta el token, la dirección pública o la configuración no es válida |
| 502 / 504 | Error del proveedor, respuesta inválida o timeout |

## Validación realizada

- `npm test`: 33 pruebas acumuladas de catálogo, carrito y checkout, incluyendo preferencias sin correo.
- Prueba del SDK oficial interceptando su llamada HTTP para verificar Authorization, clave de idempotencia y cuerpo. Ningún test automático realiza una compra ni una llamada real a MercadoPago.
- Decodificación del QR generado para comprobar que contiene exactamente el enlace de checkout.
- En navegador: correo opcional (se rechaza si se completa con formato inválido), botones bloqueados durante la solicitud, misma preferencia para QR/redirección, descarga, error/reintento, vencimiento, cambios de carrito durante la petición o desde otra pestaña y retornos manipulados.
- Capturas revisadas y recorrido sin desbordes a 390/320 px ni errores de JavaScript.
- Verificación en MercadoPago: preferencia de cuenta vendedora de prueba creada correctamente sin correo y QR decodificado. El usuario completó la compra y se confirmó por API el estado `approved` / `accredited`; no se tomó el estado de la URL como prueba.
- Verificación del regreso: página `/checkout/success` accesible por el túnel, con respuesta HTTP 200.
- Pendiente: confirmación automática dentro de la tienda mediante QM7 y escaneo físico del QR desde un celular.

Referencias de implementación: [crear preferencias](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/create-payment-preference), [SDK oficial Node.js](https://github.com/mercadopago/sdk-nodejs) y [referencia de la API](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro-preferences/create-preference/post).
