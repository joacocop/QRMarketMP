export const CART_STORAGE_KEY = 'qrmarket.cart.v1';

// Se guardan únicamente IDs y cantidades. Precios y stock provienen del catálogo.
export function createCart(products, { storage = null, onStorageError = () => {} } = {}) {
  const catalog = new Map(products.map((product) => [product.id, product]));
  let quantities = new Map();

  function restore(raw) {
    const next = new Map();
    try {
      const saved = JSON.parse(raw);
      if (saved?.version === 1 && Array.isArray(saved.items)) {
        for (const item of saved.items) {
          const product = catalog.get(item?.id);
          if (!product || !product.stock || !Number.isSafeInteger(item.quantity) || item.quantity < 1) continue;
          const quantity = Math.min(item.quantity, product.stock);
          next.set(product.id, Math.min((next.get(product.id) || 0) + quantity, product.stock));
        }
      }
    } catch {
      // Un dato corrupto no debe impedir abrir el catálogo ni usar el carrito.
    }
    quantities = next;
  }

  function persist() {
    if (!storage) return;
    try {
      storage.setItem(CART_STORAGE_KEY, JSON.stringify({
        version: 1,
        items: [...quantities].map(([id, quantity]) => ({ id, quantity })),
      }));
    } catch { onStorageError(); }
  }

  function validate(id, quantity) {
    const product = catalog.get(id);
    if (!product) throw new RangeError('El producto ya no está disponible.');
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new RangeError('Elegí una cantidad entera mayor a cero.');
    }
    if (quantity > product.stock) throw new RangeError('La cantidad supera el stock disponible.');
  }

  const cart = {
    quantity(id) { return quantities.get(id) || 0; },
    count() { return [...quantities.values()].reduce((sum, quantity) => sum + quantity, 0); },
    items() {
      return [...quantities].map(([id, quantity]) => ({
        product: catalog.get(id), quantity, lineTotal: catalog.get(id).price * quantity,
      }));
    },
    subtotal() { return cart.items().reduce((sum, item) => sum + item.lineTotal, 0); },
    add(id, quantity) {
      validate(id, quantity);
      const total = cart.quantity(id) + quantity;
      validate(id, total);
      quantities.set(id, total);
      persist();
    },
    setQuantity(id, quantity) {
      validate(id, quantity);
      if (!quantities.has(id)) throw new RangeError('El producto no está en el carrito.');
      quantities.set(id, quantity);
      persist();
    },
    remove(id) { quantities.delete(id); persist(); },
    clear() { quantities.clear(); persist(); },
    reload() {
      if (!storage) return false;
      try { restore(storage.getItem(CART_STORAGE_KEY)); return true; }
      catch { onStorageError(); return false; }
    },
  };
  const restored = cart.reload();
  // Normaliza cantidades antiguas frente a cambios de stock o catálogo.
  if (storage && restored) persist();
  return cart;
}
