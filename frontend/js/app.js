import { createSelection } from './selection.js';

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const selection = createSelection();
const main = document.querySelector('#main');
const search = document.querySelector('#search');
const dialog = document.querySelector('#selection-dialog');
const arrow = '<span aria-hidden="true">↗</span>';
const check = '<span aria-hidden="true">✓</span>';
let products = [];
let catalogUrl = '/';
let toastTimer;

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
      <div class="product-content"><span class="product-category">${escapeHTML(product.category)}</span><h3>${escapeHTML(product.title)}</h3><p class="product-price">${money.format(product.price)}</p>${stockLabel(product)}</div>
    </a>
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
      <div class="hero-art" aria-hidden="true"><span class="hero-circle"></span><img class="hero-headphones" src="/assets/auriculares.svg" alt="" width="600" height="480"><span class="hero-spark">✳</span><div class="hero-note"><span class="note-icon">♪</span><div>Diseñados para tu día.<br><strong>Elegidos por vos.</strong></div></div><span class="hero-caption">LA SELECCIÓN · 2026</span></div>
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
    && normalize(`${product.title} ${product.category} ${product.description}`).includes(normalize(query.trim())));
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
        <details class="product-info"><summary>Más sobre este producto <span aria-hidden="true">+</span></summary><p>${escapeHTML(product.detail)}</p></details>
        <a class="back-link" href="${escapeHTML(catalogUrl)}" data-link><span aria-hidden="true">←</span> Volver al catálogo</a>
      </section>
    </div>
    <section class="related" aria-labelledby="related-title"><div class="section-heading"><div><span class="eyebrow">HAY MÁS PARA DESCUBRIR</span><h2 id="related-title">También te pueden gustar<span>.</span></h2></div><a href="${escapeHTML(catalogUrl)}" data-link class="back-link">Ver todo ${arrow}</a></div><div class="product-grid related-grid">${related.map(card).join('')}</div></section>
  </div>`;
  const quantity = document.querySelector('#quantity');
  const decrease = document.querySelector('#decrease');
  const increase = document.querySelector('#increase');
  const addButton = document.querySelector('#add-button');
  const remaining = () => product.stock - selection.quantity(product.id);
  function syncQuantity() {
    const available = remaining();
    quantity.disabled = !available;
    quantity.max = String(available);
    decrease.disabled = !available || quantity.valueAsNumber <= 1;
    increase.disabled = !available || quantity.valueAsNumber >= available;
    addButton.disabled = !available;
    addButton.innerHTML = available ? `Agregar al carrito ${arrow}` : product.stock ? 'Stock seleccionado' : 'Sin stock';
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
      selection.add(product, amount);
      document.querySelector('#selection-count').textContent = selection.count();
      document.querySelector('#add-message').textContent = `${amount} ${amount === 1 ? 'unidad agregada' : 'unidades agregadas'} a tu selección.`;
      showToast(`${check} ${escapeHTML(product.title)} se agregó a tu selección.`);
      quantity.value = '1';
      syncQuantity();
    } catch (error) {
      document.querySelector('#add-message').textContent = error.message;
    }
  });
  syncQuantity();
}

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
document.querySelector('#open-selection').addEventListener('click', () => {
  const items = selection.entries().map(([id, quantity]) => ({ product: products.find((product) => product.id === id), quantity }));
  document.querySelector('#selection-content').innerHTML = items.length ? `<ul class="selection-list">${items.map(({ product, quantity }) => `<li><img class="${product.color}" src="${product.image}" alt="" width="70" height="64"><div><strong>${escapeHTML(product.title)}</strong><span>${quantity} × ${money.format(product.price)}</span></div><strong>${money.format(product.price * quantity)}</strong></li>`).join('')}</ul><div class="selection-total"><span>Subtotal</span><strong>${money.format(items.reduce((total, { product, quantity }) => total + product.price * quantity, 0))}</strong></div>` : '<div class="empty-selection"><p>Todavía no elegiste productos.</p><span>Tu próximo favorito está a un clic.</span></div>';
  dialog.showModal();
});
document.querySelector('#close-selection').addEventListener('click', () => dialog.close());
document.querySelector('#continue-shopping').addEventListener('click', () => { dialog.close(); if (location.pathname !== '/') navigate(catalogUrl); });
dialog.addEventListener('click', (event) => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });

async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    if (!response.ok) throw new Error('No se pudo cargar el catálogo.');
    const data = await response.json();
    products = data.products;
    renderRoute();
  } catch {
    main.innerHTML = '<div class="container empty-state page-empty"><h1>No pudimos cargar el catálogo</h1><p>Revisá tu conexión e intentá de nuevo.</p><button class="button button-primary" id="retry">Volver a intentar</button></div>';
    document.querySelector('#retry').addEventListener('click', loadProducts);
  }
}
loadProducts();
