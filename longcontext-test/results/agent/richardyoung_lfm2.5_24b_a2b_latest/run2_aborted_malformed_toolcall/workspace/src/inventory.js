'use strict';

class InventoryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InventoryError';
  }
}

/** Stock levels per SKU (SPEC section 4). */
class Inventory {
  constructor(stock = {}) {
    this.stock = new Map(Object.entries(stock));
  }

  available(sku) {
    return this.stock.get(sku) ?? 0;
  }

  reserve(sku, qty) {
    const a = this.available(sku);
    if (qty > a) throw new InventoryError(`Insufficient stock for ${sku}: requested ${qty}, available ${a}`);
    this.stock.set(sku, a - qty);
  }

  release(sku, qty) {
    this.stock.set(sku, this.available(sku) + qty);
  }
}

module.exports = { Inventory, InventoryError };
