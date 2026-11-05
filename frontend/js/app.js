import { createCart, CART_STORAGE_KEY } from './cart.js';
import { createCheckoutSession } from './checkout.js';

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
let cart;
const main = document.querySelector('#main');
const search = document.querySelector('#search');
const dialog = document.querySelector('#qr-dialog');
const paymentDialog = document.querySelector('#payment-dialog');
const arrow = '<span aria-hidden="true">↗</span>';
const check = '<span aria-hidden="true">✓</span>';
let products = [];
let catalogUrl = '/';
let toastTimer;
let qrRequest = 0;
let buyerEmail = '';
let checkoutBusy = false;
let viewVersion = 0;
let paymentExpiryTimer;
const checkoutSession = createCheckoutSession({ getItems: () => cart?.items() || [] });

function invalidateCheckout() {
  checkoutSession.invalidate();
  if (paymentDialog.open) paymentDialog.close();
}

function storageError() { document.querySelector('#storage-notice').hidden = false; }
function browserStorage() {
  try { return window.localStorage; }
  catch { storageError(); return null; }
}
function updateCartCount() { document.querySelector('#cart-count').textContent = cart.count(); }
const qrIcon = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2 2h6v6H2zM12 2h6v6h-6zM2 12h6v6H2zM12 12h3v3h3v3h-6z"/></svg>';

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}
function stockLabel(product) {
  if (!product.stock) return '<span class="stock sold-out">Sin stock</span>';
  return `<span class="stock"><span class="stock-dot" aria-hidden="true"></span>${product.stock} ${product.stock === 1 ? 'unidad disponible' : 'unidades disponibles'}</span>`;
}
function card(product) {
  return `<article class="product-card">
    <a class="product-link" href="/productos/${product.id}" data-link>
      <div class="product-visual ${product.color}">
        ${product.tag ? `<span class="product-tag">${escapeHTML(product.tag)}</span>` : ''}
        ${!product.stock ? '<span class="product-tag unavailable-tag">Agotado</span>' : ''}
        <img src="${product.image}" alt="${escapeHTML(product.title)}" width="600" height="480" loading="lazy">
        <span class="card-arrow" aria-hidden="true">↗</span>
      </div>
      <div class="product-content"><span class="product-category">${escapeHTML(product.brand)} · ${escapeHTML(product.category)}</span><h3>${escapeHTML(product.title)}</h3><p class="product-price">${money.format(product.price)}</p></div>
    </a>
    <div class="card-footer">${stockLabel(product)}<button class="card-qr" data-qr="${product.id}" aria-label="Ver QR de ${escapeHTML(product.title)}" title="Ver QR del producto">${qrIcon}</button></div>
  </article>`;
}

function renderCatalog() {
  document.title = 'QRMarket MP · Encontrá tu próximo favorito';
  const params = new URLSearchParams(location.search);
  search.value = params.get('buscar') || '';
  const category = params.get('categoria') || 'Todos';
  const categories = ['Todos', ...new Set(products.map((product) => product.category))];
  main.innerHTML = `<div class="container">
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy"><span class="eyebrow"><span class="small-line"></span> BIENVENIDO A QRMARKET</span><h1 id="hero-title">Tu próximo hallazgo<br>está <em>acá.</em></h1><p>Objetos que te gustan, para la vida que llevás.<br>Descubrí nuestra selección y encontrá el tuyo.</p><a href="#catalogo" class="button button-primary">Explorar productos ${arrow}</a></div>
      <div class="hero-art" aria-hidden="true"><span class="hero-circle"></span><img class="hero-headphones" src="${products[0].image}" alt="" width="600" height="480"><span class="hero-spark">✳</span><div class="hero-note"><span class="note-icon">♪</span><div>El sonido de tus días.<br><strong>Sony WH-CH520.</strong></div></div><span class="hero-caption">LA SELECCIÓN · 2026</span></div>
    </section>
    <section class="catalog" id="catalogo" aria-labelledby="catalog-title">
      <div class="section-heading"><div><span class="eyebrow">COSAS LINDAS, TODOS LOS DÍAS</span><h2 id="catalog-title">Encontrá tu próximo favorito<span>.</span></h2></div><p id="result-count" role="status" aria-live="polite"></p></div>
      <div class="catalog-toolbar"><div class="categories" role="group" aria-label="Filtrar por categoría">${categories.map((name) => `<button type="button" class="category-chip ${name === category ? 'active' : ''}" data-category="${escapeHTML(name)}" aria-pressed="${name === category}">${escapeHTML(name)}</button>`).join('')}</div><label class="sort-label">Ordenar por <select id="sort" aria-label="Ordenar productos"><option value="destacados">Destacados</option><option value="precio-asc">Menor precio</option><option value="precio-desc">Mayor precio</option><option value="nombre">Nombre</option></select></label></div>
      <div class="active-search" id="active-search" hidden></div><div class="product-grid" id="product-grid"></div>
    </section>
    <aside class="discovery-note"><span class="discovery-symbol" aria-hidden="true">✳</span><div><h2>Lo cotidiano puede ser extraordinario.</h2><p>Una selección pensada para acompañarte, todos los días.</p></div><a href="#catalogo" aria-label="Volver a explorar el catálogo">Seguí descubriendo ${arrow}</a></aside>
  </div>`;
  document.querySelector('#sort').value = ['precio-asc', 'precio-desc', 'nombre'].includes(params.get('orden')) ? params.get('orden') : 'destacados';
  document.querySelectorAll('[data-category]').forEach((button) => button.addEventListener('click', () => {
    updateCatalogParams({ categoria: button.dataset.category === 'Todos' ? '' : button.dataset.category });
    document.querySelectorAll('[data-category]').forEach((chip) => {
      const active = chip === button;
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-pressed', active);
    });
    renderGrid();
  }));
  document.querySelector('#sort').addEventListener('change', (event) => {
    updateCatalogParams({ orden: event.target.value === 'destacados' ? '' : event.target.value });
    renderGrid();
  });
  renderGrid();
}

function updateCatalogParams(changes) {
  const params = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(changes)) value ? params.set(key, value) : params.delete(key);
  const query = params.toString();
  catalogUrl = `/${query ? `?${query}` : ''}`;
  history.replaceState({}, '', catalogUrl);
}
function normalize(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
}
function renderGrid() {
  const params = new URLSearchParams(location.search);
  const query = params.get('buscar') || '';
  const category = params.get('categoria');
  let result = products.filter((product) => (!category || product.category === category)
    && normalize(`${product.brand} ${product.title} ${product.category} ${product.description}`).includes(normalize(query.trim())));
  switch (params.get('orden')) {
    case 'precio-asc': result.sort((a, b) => a.price - b.price); break;
    case 'precio-desc': result.sort((a, b) => b.price - a.price); break;
    case 'nombre': result.sort((a, b) => a.title.localeCompare(b.title, 'es')); break;
  }
  document.querySelector('#result-count').textContent = `${result.length} ${result.length === 1 ? 'producto' : 'productos'}`;
  const activeSearch = document.querySelector('#active-search');
  activeSearch.hidden = !query;
  activeSearch.innerHTML = query ? `<span>Resultados para “${escapeHTML(query)}”</span><button class="text-button" id="clear-search">Limpiar búsqueda ×</button>` : '';
  document.querySelector('#clear-search')?.addEventListener('click', () => { search.value = ''; updateCatalogParams({ buscar: '' }); renderGrid(); search.focus(); });
  document.querySelector('#product-grid').innerHTML = result.length ? result.map(card).join('')
    : '<div class="empty-state"><span aria-hidden="true">⌕</span><h3>No encontramos esos productos</h3><p>Probá con otra búsqueda o elegí otra categoría.</p><button class="button button-primary" id="reset-filters">Ver todos los productos</button></div>';
  document.querySelector('#reset-filters')?.addEventListener('click', () => navigate('/'));
}

function renderDetail(product) {
  document.title = `${product.title} · QRMarket MP`;
  search.value = '';
  const related = products.filter((item) => item.id !== product.id && item.stock > 0)
    .sort((a, b) => Number(b.category === product.category) - Number(a.category === product.category)).slice(0, 3);
  main.innerHTML = `<div class="container detail-page">
    <nav class="breadcrumb" aria-label="Ruta de navegación"><a href="${escapeHTML(catalogUrl)}" data-link>Catálogo</a><span aria-hidden="true">/</span><span>${escapeHTML(product.category)}</span><span aria-hidden="true">/</span><span aria-current="page">${escapeHTML(product.title)}</span></nav>
    <div class="product-detail"><div class="detail-visual ${product.color}">${product.tag ? `<span class="product-tag">${escapeHTML(product.tag)}</span>` : ''}<img src="${product.image}" alt="${escapeHTML(product.title)}" width="600" height="480"><span class="detail-image-caption">HECHO PARA ACOMPAÑARTE</span></div>
      <section class="detail-copy" aria-labelledby="product-title"><span class="eyebrow">${escapeHTML(product.category)}</span><h1 id="product-title">${escapeHTML(product.title)}</h1><p class="product-subtitle">${escapeHTML(product.subtitle)}</p><p class="detail-price">${money.format(product.price)} <span>ARS</span></p>${stockLabel(product)}
        <p class="description">${escapeHTML(product.description)}</p><ul class="features">${product.features.map((feature) => `<li>${check}${escapeHTML(feature)}</li>`).join('')}</ul>
        <form id="add-form" class="add-form"><div class="quantity-row"><label for="quantity">Cantidad</label><span id="quantity-hint"></span></div><div class="purchase-controls"><div class="quantity-control"><button type="button" id="decrease" aria-label="Disminuir cantidad">−</button><input type="number" id="quantity" name="quantity" value="1" min="1" max="${product.stock}" step="1" required aria-describedby="quantity-hint" aria-label="Cantidad de unidades"><button type="button" id="increase" aria-label="Aumentar cantidad">+</button></div><button type="submit" id="add-button" class="button button-primary">Agregar al carrito ${arrow}</button></div><p class="form-message" id="add-message" role="status" aria-live="polite"></p></form>
        <details class="product-info"><summary>Más sobre este producto <span aria-hidden="true">+</span></summary><p>${escapeHTML(product.detail)}</p><a class="manufacturer-link" href="${escapeHTML(product.sourceUrl)}" target="_blank" rel="noopener noreferrer">Ficha oficial de ${escapeHTML(product.brand)} ↗</a></details>
        <div class="product-actions"><button class="button button-secondary" data-qr="${product.id}">${qrIcon} Ver QR del producto</button><a href="/carrito" data-link>Ver mi carrito ${arrow}</a></div>
        <a class="back-link" href="${escapeHTML(catalogUrl)}" data-link><span aria-hidden="true">←</span> Volver al catálogo</a>
      </section>
    </div>
    <section class="related" aria-labelledby="related-title"><div class="section-heading"><div><span class="eyebrow">HAY MÁS PARA DESCUBRIR</span><h2 id="related-title">También te pueden gustar<span>.</span></h2></div><a href="${escapeHTML(catalogUrl)}" data-link class="back-link">Ver todo ${arrow}</a></div><div class="product-grid related-grid">${related.map(card).join('')}</div></section>
  </div>`;
  const quantity = document.querySelector('#quantity');
  const decrease = document.querySelector('#decrease');
  const increase = document.querySelector('#increase');
  const addButton = document.querySelector('#add-button');
  const remaining = () => product.stock - cart.quantity(product.id);
  function syncQuantity() {
    const available = remaining();
    quantity.disabled = !available;
    quantity.max = String(available);
    decrease.disabled = !available || quantity.valueAsNumber <= 1;
    increase.disabled = !available || quantity.valueAsNumber >= available;
    addButton.disabled = !available;
    addButton.innerHTML = available ? `Agregar al carrito ${arrow}` : product.stock ? 'Ya tenés todo el stock en tu carrito' : 'Sin stock';
    document.querySelector('#quantity-hint').textContent = !product.stock ? 'Producto agotado' : `${available} disponibles para agregar`;
  }
  decrease.addEventListener('click', () => { quantity.value = String(Math.max(1, (quantity.valueAsNumber || 1) - 1)); syncQuantity(); });
  increase.addEventListener('click', () => { quantity.value = String(Math.min(remaining(), (quantity.valueAsNumber || 0) + 1)); syncQuantity(); });
  quantity.addEventListener('input', syncQuantity);
  document.querySelector('#add-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!quantity.reportValidity()) return;
    try {
      const amount = quantity.valueAsNumber;
      cart.add(product.id, amount);
      invalidateCheckout();
      updateCartCount();
      document.querySelector('#add-message').innerHTML = `${amount} ${amount === 1 ? 'unidad agregada' : 'unidades agregadas'} a tu carrito. <a href="/carrito" data-link>Ver carrito →</a>`;
      showToast(`${check} ${escapeHTML(product.title)} se agregó a tu carrito.`);
      quantity.value = '1';
      syncQuantity();
    } catch (error) {
      document.querySelector('#add-message').textContent = error.message;
    }
  });
  syncQuantity();
}

function renderCart() {
  viewVersion++;
  document.title = 'Tu carrito · QRMarket MP';
  search.value = '';
  const items = cart.items();
  main.innerHTML = `<div class="container cart-page">
    <nav class="breadcrumb" aria-label="Ruta de navegación"><a href="${escapeHTML(catalogUrl)}" data-link>Catálogo</a><span aria-hidden="true">/</span><span aria-current="page">Tu carrito</span></nav>
    <div class="section-heading"><div><span class="eyebrow">TUS PRÓXIMOS FAVORITOS</span><h1>Tu carrito<span>.</span></h1></div>${items.length ? '<button class="text-button" data-cart-action="clear">Vaciar carrito</button>' : ''}</div>
    ${items.length ? `<div class="cart-layout"><section class="cart-items" aria-label="Productos en tu carrito">${items.map(({ product, quantity, lineTotal }) => `
      <article class="cart-item" data-cart-item="${product.id}">
        <a class="cart-item-image ${product.color}" href="/productos/${product.id}" data-link><img src="${product.image}" alt="${escapeHTML(product.title)}" width="120" height="120"></a>
        <div class="cart-item-description"><span class="product-category">${escapeHTML(product.brand)}</span><a href="/productos/${product.id}" data-link><h2>${escapeHTML(product.title)}</h2></a><p>${money.format(product.price)} <span>por unidad</span></p>${stockLabel(product)}<button class="remove-item" data-cart-action="remove" data-id="${product.id}" aria-label="Eliminar ${escapeHTML(product.title)}">Eliminar</button></div>
        <div class="cart-item-amount"><div class="quantity-control"><button type="button" data-cart-action="decrease" data-id="${product.id}" aria-label="Disminuir ${escapeHTML(product.title)}" ${quantity <= 1 ? 'disabled' : ''}>−</button><input type="number" value="${quantity}" min="1" max="${product.stock}" step="1" required data-cart-quantity="${product.id}" aria-label="Cantidad de ${escapeHTML(product.title)}"><button type="button" data-cart-action="increase" data-id="${product.id}" aria-label="Aumentar ${escapeHTML(product.title)}" ${quantity >= product.stock ? 'disabled' : ''}>+</button></div><strong>${money.format(lineTotal)}</strong></div>
      </article>`).join('')}</section>
      <aside class="cart-summary" aria-labelledby="summary-title"><span class="eyebrow">UN PASO MÁS CERCA</span><h2 id="summary-title">Tu selección</h2><div class="summary-row"><span>Productos</span><span>${cart.count()} ${cart.count() === 1 ? 'unidad' : 'unidades'}</span></div><div class="summary-total"><span>Subtotal</span><strong id="cart-subtotal">${money.format(cart.subtotal())}</strong></div>
        <form id="checkout-form" class="checkout-form"><label for="buyer-email">Tu correo electrónico (opcional)</label><input type="email" id="buyer-email" name="email" value="${escapeHTML(buyerEmail)}" maxlength="254" autocomplete="email" inputmode="email" placeholder="vos@ejemplo.com"><p class="checkout-help">Podés dejarlo vacío e iniciar sesión con tu cuenta de MercadoPago para continuar.</p><button type="submit" data-payment-method="checkout" class="button button-primary">Pagar con MercadoPago ${arrow}</button><button type="submit" data-payment-method="qr" class="button button-secondary">${qrIcon} Pagar con QR</button><p id="checkout-error" class="checkout-error" role="alert" hidden></p></form>
        <p class="payment-assurance">Tus datos de pago se ingresan en MercadoPago.</p><a class="continue-link" href="${escapeHTML(catalogUrl)}" data-link>Seguir comprando ${arrow}</a><span class="demo-note">Precios y stock de demostración · ARS</span></aside></div>`
      : `<div class="empty-state empty-cart"><span aria-hidden="true">✳</span><h2>Acá empieza tu próximo hallazgo.</h2><p>Tu carrito está vacío. Explorá el catálogo y agregá lo que más te guste.</p><a href="${escapeHTML(catalogUrl)}" data-link class="button button-primary">Explorar productos ${arrow}</a></div>`}
  </div>`;
  syncCheckoutControls();
}

function syncCheckoutControls() {
  const form = document.querySelector('#checkout-form');
  if (!form) return;
  form.querySelectorAll('input, button').forEach((control) => { control.disabled = checkoutBusy; });
  form.setAttribute('aria-busy', String(checkoutBusy));
  form.querySelector('[data-payment-method="checkout"]').innerHTML = checkoutBusy ? 'Preparando tu pago…' : `Pagar con MercadoPago ${arrow}`;
  form.querySelector('[data-payment-method="qr"]').innerHTML = `${qrIcon} Pagar con QR`;
}

async function startPayment(method) {
  const form = document.querySelector('#checkout-form');
  if (checkoutBusy || !form?.reportValidity()) return;
  const version = viewVersion;
  buyerEmail = form.querySelector('#buyer-email').value.trim();
  const errorMessage = form.querySelector('#checkout-error');
  errorMessage.hidden = true;
  checkoutBusy = true;
  syncCheckoutControls();
  try {
    const payment = await checkoutSession.prepare(buyerEmail);
    if (version !== viewVersion || location.pathname.replace(/\/$/, '') !== '/carrito') return;
    if (method === 'qr') showPaymentQR(payment);
    else window.location.assign(payment.init_point);
  } catch (error) {
    const currentError = document.querySelector('#checkout-error');
    if (currentError) { currentError.textContent = error.message; currentError.hidden = false; }
  } finally { checkoutBusy = false; syncCheckoutControls(); }
}

function showPaymentQR(payment) {
  clearTimeout(paymentExpiryTimer);
  const content = document.querySelector('#payment-content');
  const expiry = new Date(payment.expires_at);
  content.innerHTML = `<p class="qr-intro">Escaneá el código con tu celular y completá el pago en MercadoPago.</p><div class="payment-total"><span>Importe a pagar</span><strong>${money.format(payment.total)} <small>ARS</small></strong></div><img class="qr-image" src="${payment.qr_image}" alt="QR para pagar ${money.format(payment.total)} en MercadoPago" width="400" height="400"><p class="payment-expiry">Disponible hasta las <time datetime="${escapeHTML(payment.expires_at)}">${expiry.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</time>.</p><div class="payment-qr-actions"><a class="button button-primary" href="${escapeHTML(payment.init_point)}" target="_blank" rel="noopener noreferrer">Abrir MercadoPago ${arrow}</a><a class="button button-secondary" href="${payment.qr_image}" download="qrmarket-pago.png">Descargar QR <span aria-hidden="true">↓</span></a></div><p class="payment-expired" role="status" hidden>Este enlace venció. Cerrá esta ventana y generá un nuevo QR.</p><span class="demo-note">El QR abre el checkout de MercadoPago.</span>`;
  if (!paymentDialog.open) paymentDialog.showModal();
  paymentExpiryTimer = setTimeout(() => {
    content.querySelector('.payment-expired').hidden = false;
    content.querySelector('.payment-qr-actions').hidden = true;
  }, Math.max(0, expiry.getTime() - Date.now()));
}

function renderCheckoutReturn(status) {
  document.title = 'Tu pago · QRMarket MP';
  const copy = {
    success: ['Volviste de MercadoPago.', 'Si terminaste de pagar, podés consultar el resultado en tu cuenta de MercadoPago. Tu carrito permanece guardado.'],
    failure: ['Podés volver a intentarlo.', 'Si el pago no se completó, volvé al carrito para elegir otra opción. Podés consultar el resultado de la operación en MercadoPago.'],
    pending: ['Consultá el estado de tu pago.', 'Algunos medios de pago pueden demorar. Revisá el resultado y los próximos pasos en tu cuenta de MercadoPago. Tu carrito permanece guardado.'],
  }[status];
  main.innerHTML = `<div class="container checkout-return"><span class="eyebrow">TU COMPRA EN QRMARKET</span><span class="return-symbol" aria-hidden="true">↗</span><h1>${copy[0]}</h1><p>${copy[1]}</p><div class="return-actions"><a class="button button-primary" href="/carrito" data-link>Volver a mi carrito ${arrow}</a><a class="back-link" href="/" data-link>Explorar productos</a></div></div>`;
}

main.addEventListener('submit', (event) => {
  if (event.target.id !== 'checkout-form') return;
  event.preventDefault();
  startPayment(event.submitter?.dataset.paymentMethod || 'checkout');
});
main.addEventListener('input', (event) => {
  if (event.target.id === 'buyer-email') { buyerEmail = event.target.value; checkoutSession.invalidate(); }
});
document.querySelector('#close-payment').addEventListener('click', () => paymentDialog.close());
paymentDialog.addEventListener('close', () => clearTimeout(paymentExpiryTimer));
paymentDialog.addEventListener('click', (event) => {
  if (event.target !== paymentDialog) return;
  const rect = paymentDialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) paymentDialog.close();
});

async function openQR(id) {
  const product = products.find((item) => item.id === id);
  if (!product) return;
  const request = ++qrRequest;
  document.querySelector('#qr-title').textContent = product.title;
  const content = document.querySelector('#qr-content');
  content.innerHTML = '<p class="qr-loading" role="status">Generando el QR de tu producto…</p>';
  if (!dialog.open) dialog.showModal();
  try {
    const response = await fetch(`/api/products/${id}/qr`);
    if (!response.ok) throw new Error('No pudimos generar el QR.');
    const data = await response.json();
    if (request !== qrRequest || !dialog.open) return;
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(data.url).hostname);
    content.innerHTML = `<p class="qr-intro">Escaneá este código para abrir la página del producto.</p><img class="qr-image" src="${data.qrImage}" alt="QR para abrir ${escapeHTML(product.title)}" width="400" height="400"><a class="qr-target" href="${escapeHTML(data.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(data.url)}</a><a class="button button-primary qr-download" href="/api/products/${id}/qr.png" download="${id}-qr.png">Descargar QR <span aria-hidden="true">↓</span></a>${local ? '<p class="qr-local-note">El enlace usa localhost. Para abrirlo desde tu celular, accedé a la tienda con la dirección de tu computadora en la misma red Wi-Fi o con una dirección pública.</p>' : ''}`;
  } catch {
    if (request === qrRequest && dialog.open) content.innerHTML = `<div class="qr-error"><p>No pudimos generar el QR. Intentá de nuevo.</p><button class="button button-primary" data-qr="${id}">Reintentar</button></div>`;
  }
}

document.addEventListener('click', (event) => {
  const qrButton = event.target.closest('[data-qr]');
  if (qrButton) openQR(qrButton.dataset.qr);
  const button = event.target.closest('[data-cart-action]');
  if (!button || !cart) return;
  const { cartAction: action, id } = button.dataset;
  try {
    if (action === 'clear') cart.clear();
    if (action === 'remove') cart.remove(id);
    if (action === 'increase') cart.setQuantity(id, cart.quantity(id) + 1);
    if (action === 'decrease') cart.setQuantity(id, cart.quantity(id) - 1);
    invalidateCheckout();
    updateCartCount();
    renderCart();
    const control = [...main.querySelectorAll('[data-cart-action]')].find((item) => item.dataset.cartAction === action && item.dataset.id === id && !item.disabled);
    (control || main).focus({ preventScroll: true });
    if (action === 'remove') showToast('Producto eliminado del carrito.');
    if (action === 'clear') showToast('Vaciaste tu carrito.');
  } catch (error) { showToast(escapeHTML(error.message)); }
});

main.addEventListener('change', (event) => {
  const input = event.target.closest('[data-cart-quantity]');
  if (!input) return;
  const id = input.dataset.cartQuantity;
  try {
    cart.setQuantity(id, input.valueAsNumber);
    invalidateCheckout();
    updateCartCount();
    renderCart();
    main.querySelector(`[data-cart-quantity="${id}"]`)?.focus({ preventScroll: true });
  } catch (error) {
    input.value = String(cart.quantity(id));
    showToast(escapeHTML(error.message));
  }
});

window.addEventListener('storage', (event) => {
  if (!cart || (event.key !== CART_STORAGE_KEY && event.key !== null)) return;
  cart.reload();
  const wasPaying = paymentDialog.open;
  invalidateCheckout();
  if (wasPaying) showToast('El carrito cambió en otra pestaña. Revisalo y generá un nuevo pago.');
  updateCartCount();
  if (location.pathname !== '/') renderRoute();
});

function showToast(message) {
  clearTimeout(toastTimer);
  const toast = document.querySelector('#toast');
  toast.innerHTML = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
}
function renderNotFound() {
  document.title = 'Producto no encontrado · QRMarket MP';
  main.innerHTML = '<div class="container empty-state page-empty"><span class="eyebrow">404</span><h1>Este hallazgo no está por acá.</h1><p>El producto que buscás no existe o el enlace es incorrecto.</p><a href="/" data-link class="button button-primary">Volver al catálogo ↗</a></div>';
}
function renderRoute() {
  viewVersion++;
  const checkoutReturn = location.pathname.match(/^\/checkout\/(success|failure|pending)\/?$/);
  if (checkoutReturn) { renderCheckoutReturn(checkoutReturn[1]); return; }
  if (location.pathname === '/carrito' || location.pathname === '/carrito/') {
    renderCart();
    return;
  }
  if (location.pathname === '/') {
    catalogUrl = location.pathname + location.search;
    renderCatalog();
    return;
  }
  const match = location.pathname.match(/^\/productos\/([^/]+)\/?$/);
  const product = match && products.find((item) => item.id === decodeURIComponent(match[1]));
  product ? renderDetail(product) : renderNotFound();
}
function navigate(url) {
  history.pushState({}, '', url);
  renderRoute();
  window.scrollTo({ top: 0, behavior: 'instant' });
  main.focus({ preventScroll: true });
}
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-link]');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  navigate(link.getAttribute('href'));
});
window.addEventListener('popstate', () => { if (products.length) renderRoute(); });
document.querySelector('#search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!products.length) return;
  const params = new URLSearchParams(location.pathname === '/' ? location.search : '');
  const value = search.value.trim();
  value ? params.set('buscar', value) : params.delete('buscar');
  navigate(`/${params.size ? `?${params}` : ''}`);
  document.querySelector('#catalogo').scrollIntoView({ behavior: 'smooth' });
});
document.querySelector('#close-qr').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { qrRequest++; });
dialog.addEventListener('click', (event) => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });

async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    if (!response.ok) throw new Error('No se pudo cargar el catálogo.');
    const data = await response.json();
    products = data.products;
    if (!cart) cart = createCart(products, { storage: browserStorage(), onStorageError: storageError });
    updateCartCount();
    renderRoute();
  } catch {
    main.innerHTML = '<div class="container empty-state page-empty"><h1>No pudimos cargar el catálogo</h1><p>Revisá tu conexión e intentá de nuevo.</p><button class="button button-primary" id="retry">Volver a intentar</button></div>';
    document.querySelector('#retry').addEventListener('click', loadProducts);
  }
}
loadProducts();
