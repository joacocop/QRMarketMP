import QRCode from 'qrcode';

export function productUrl(id, requestOrigin, publicBaseUrl = process.env.PUBLIC_BASE_URL) {
  const base = new URL(publicBaseUrl || requestOrigin);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
    throw new Error('La dirección pública de la tienda debe usar HTTP o HTTPS.');
  }
  return new URL(`/productos/${encodeURIComponent(id)}`, base.origin).href;
}

export async function productQR(id, requestOrigin) {
  const url = productUrl(id, requestOrigin);
  const image = await QRCode.toBuffer(url, {
    type: 'png', width: 400, margin: 4, errorCorrectionLevel: 'M',
    color: { dark: '#4b3026ff', light: '#ffffffff' },
  });
  return { url, image };
}
