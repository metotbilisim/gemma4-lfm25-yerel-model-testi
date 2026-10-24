'use strict';

const { CouponError, assertCouponUsable, priceLines, summarize } = require('./pricing');
const { roundHalfAwayFromZero } = require('./money');

class OrderError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OrderError';
  }
}

class RefundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RefundError';
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class OrderService {
  constructor({ catalog, inventory, coupons = [] }) {
    this.catalog = catalog;
    this.inventory = inventory;
    this.coupons = new Map(coupons.map((c) => [c.code, c]));
    this.orders = new Map();
    this.nextOrderNo = 1;
    this.nextRefundNo = 1;
    this.couponUsage = new Set();
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

    const reserved = [];
    try {
      for (const l of merged) {
        this.inventory.reserve(l.sku, l.qty);
        reserved.push(l);
      }
    } catch (e) {
      for (const l of reserved) this.inventory.release(l.sku, l.qty);
      throw e;
    }

    const priced = priceLines(merged, this.catalog, coupon);
    for (const l of priced) Object.assign(l, { refundedQty: 0, refundedNetCents: 0, refundedTaxCents: 0 });
    const id = `O${String(this.nextOrderNo++).padStart(4, '0')}`;
    const order = { id, customerId, date, couponCode, status: 'placed', lines: priced, totals: summarize(priced), refunds: [] };
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

  refundOrder(orderId, items, { date, restock = true } = {}) {
    const o = this.orders.get(orderId);
    if (!o) throw new RefundError(`Unknown order: ${orderId}`);
    if (o.status !== 'placed' && o.status !== 'partially_refunded') throw new RefundError(`Order ${orderId} cannot be refunded in status ${o.status}`);
    if (typeof date !== 'string' || !DATE_RE.test(date)) throw new RefundError('date must be YYYY-MM-DD');
    if (date < o.date) throw new RefundError('refund date before order date');
    if (!Array.isArray(items) || items.length === 0) throw new RefundError('items must be a non-empty array');
    const merged = new Map();
    for (const it of items) {
      if (!it || !Number.isInteger(it.qty) || it.qty <= 0) throw new RefundError('qty must be a positive integer');
      const line = o.lines.find((l) => l.sku === it.sku);
      if (!line) throw new RefundError(`SKU ${it.sku} is not part of order ${orderId}`);
      merged.set(it.sku, (merged.get(it.sku) ?? 0) + it.qty);
    }
    for (const [sku, k] of merged) {
      const line = o.lines.find((l) => l.sku === sku);
      if (k > line.qty - line.refundedQty) throw new RefundError(`Cannot refund ${k} x ${sku}`);
    }

    const lines = [];
    for (const [sku, k] of merged) {
      const line = o.lines.find((l) => l.sku === sku);
      let net, tax;
      if (line.refundedQty + k === line.qty) {
        net = line.netCents - line.refundedNetCents;
        tax = line.taxCents - line.refundedTaxCents;
      } else {
        net = roundHalfAwayFromZero((line.netCents * k) / line.qty);
        tax = roundHalfAwayFromZero((line.taxCents * k) / line.qty);
      }
      line.refundedQty += k;
      line.refundedNetCents += net;
      line.refundedTaxCents += tax;
      if (restock) this.inventory.release(sku, k);
      lines.push({ sku, qty: k, netCents: net, taxCents: tax, totalCents: net + tax, category: line.category });
    }
    const record = {
      id: `R${String(this.nextRefundNo++).padStart(4, '0')}`,
      orderId,
      date,
      lines: lines.map(({ category, ...rest }) => rest),
      totalCents: lines.reduce((a, l) => a + l.totalCents, 0),
    };
    Object.defineProperty(record, '_categories', { value: lines.map((l) => l.category), enumerable: false });
    o.refunds.push(record);
    o.status = o.lines.every((l) => l.refundedQty === l.qty) ? 'refunded' : 'partially_refunded';
    return record;
  }

  listOrders() {
    return [...this.orders.values()];
  }
}

module.exports = { OrderService, OrderError, RefundError };
