// Selección temporal de QM2. QM4 incorporará edición y localStorage.
export function createSelection() {
  const quantities = new Map();
  return {
    quantity(id) { return quantities.get(id) || 0; },
    count() { return [...quantities.values()].reduce((sum, quantity) => sum + quantity, 0); },
    entries() { return [...quantities.entries()]; },
    add(product, quantity) {
      if (!Number.isSafeInteger(quantity) || quantity < 1) {
        throw new RangeError('Elegí una cantidad entera mayor a cero.');
      }
      const nextQuantity = (quantities.get(product.id) || 0) + quantity;
      if (nextQuantity > product.stock) {
        throw new RangeError('La cantidad supera el stock disponible.');
      }
      quantities.set(product.id, nextQuantity);
      return nextQuantity;
    },
  };
}
