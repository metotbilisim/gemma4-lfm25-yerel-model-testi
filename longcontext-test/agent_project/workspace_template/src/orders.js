'use strict';

const { CouponError, assertCouponUsable, priceLines, summarize } = require('./pricing');

class OrderError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OrderError';
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Order life cycle (SPEC section 7). */
class OrderService {
  constructor({ catalog, inventory, coupons = [] }) {
    this.catalog = catalog;
    this.inventory = inventory;
    this.coupons = new Map(coupons.map((c) => [c.code, c]));
    this.orders = new Map();
    this.nextOrderNo = 1;
    this.couponUsage = new Set(); // "customerId:CODE"
  }

  _mergeLines(lines) {
    if (!Array.isArray(lines) || lines.length === 0) throw new OrderError('An order needs at least one line');
    const merged = new Map();
    for (const { sku, qty } of lines) {
      if (!Number.isInteger(qty) || qty <= 0) throw new OrderError(`Invalid quantity for ${sku}: ${qty}`);
      if (!this.catalog.has(sku)) throw new OrderError(`Unknown SKU: ${sku}`);
      if (!this.catalog.get(sku).active) throw new OrderError(`Product ${sku} is not available`);
      merged.set(sku, (merged.get(sku) ?? 0) + qty);
    }
    return [...merged].map(([sku, qty]) => ({ sku, qty }));
  }

  createOrder({ customerId, lines, couponCode = null, date }) {
    if (typeof customerId !== 'string' || customerId === '') throw new OrderError('customerId is required');
    if (typeof date !== 'string' || !DATE_RE.test(date)) throw new OrderError('date must be YYYY-MM-DD');
    const merged = this._mergeLines(lines);

    let coupon = null;
    if (couponCode !== null) {
      coupon = this.coupons.get(couponCode);
      if (!coupon) throw new CouponError(`Unknown coupon: ${couponCode}`);
      const subtotalCents = merged.reduce((a, l) => a + this.catalog.get(l.sku).priceCents * l.qty, 0);
      assertCouponUsable(coupon, { date, subtotalCents, customerId, usedBy: this.couponUsage });
    }

    for (const l of merged) this.inventory.reserve(l.sku, l.qty);

    const priced = priceLines(merged, this.catalog, coupon);
    const id = `O${String(this.nextOrderNo++).padStart(4, '0')}`;
    const order = { id, customerId, date, couponCode, status: 'placed', lines: priced, totals: summarize(priced) };
    if (coupon) this.couponUsage.add(`${customerId}:${coupon.code}`);
    this.orders.set(id, order);
    return order;
  }

  getOrder(id) {
    const o = this.orders.get(id);
    if (!o) throw new OrderError(`Unknown order: ${id}`);
    return o;
  }

  cancelOrder(id) {
    const o = this.getOrder(id);
    if (o.status !== 'placed') throw new OrderError(`Order ${id} cannot be cancelled in status ${o.status}`);
    for (const l of o.lines) this.inventory.release(l.sku, l.qty);
    o.status = 'cancelled';
    if (o.couponCode) this.couponUsage.delete(`${o.customerId}:${o.couponCode}`);
    return o;
  }

  listOrders() {
    return [...this.orders.values()];
  }
}

module.exports = { OrderService, OrderError };
