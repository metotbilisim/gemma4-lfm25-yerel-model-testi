'use strict';

const { VAT_RATES } = require('./pricing');

/** Product catalog (SPEC section 3). */
class Catalog {
  constructor(products = []) {
    this.products = new Map();
    for (const p of products) this.add(p);
  }

  add(product) {
    const { sku, name, priceCents, category } = product;
    if (typeof sku !== 'string' || sku.trim() === '') throw new TypeError('sku must be a non-empty string');
    if (!Number.isInteger(priceCents) || priceCents < 0) throw new TypeError('priceCents must be a non-negative integer');
    if (!(category in VAT_RATES)) throw new TypeError(`unknown category: ${category}`);
    this.products.set(sku, { sku, name: name ?? sku, priceCents, category, active: product.active !== false });
  }

  get(sku) {
    const p = this.products.get(sku);
    if (!p) throw new Error(`Unknown SKU: ${sku}`);
    return p;
  }

  has(sku) {
    return this.products.has(sku);
  }
}

module.exports = { Catalog };
