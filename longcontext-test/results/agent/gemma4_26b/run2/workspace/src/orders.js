'use strict';

const { roundHalfAwayFromZero } = require('./money');
const { CouponError, assertCouponUsable, priceLines, summarize } = require('./pricing');

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

/** Order life cycle (SPEC section 7). */
class OrderService {
  constructor({ catalog, inventory, coupons = [] }) {
    this.catalog = catalog;
    this.inventory = inventory;
    this.coupons = new Map(coupons.map((c) => [c.code, c]));
    this.orders = new Map();
    this.nextOrderNo = 1;
    this.couponUsage = new Set(); // "customerId:CODE"
    this.nextRefundNo = 1;
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
      for (const l of reserved) {
        this.inventory.release(l.sku, l.qty);
      }
      throw e;
    }

    const priced = priceLines(merged, this.catalog, coupon);
    const id = `O${String(this.nextOrderNo++).padStart(4, '0')}`;
    const order = { 
      id, 
      customerId, 
      date, 
      couponCode, 
      status: 'placed', 
      lines: priced.map(l => ({ ...l, refundedQty: 0, refundedNetCents: 0, refundedTaxCents: 0 })), 
      totals: summarize(priced),
      refunds: []
    };
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

  refundOrder(orderId, items, { date, restock = true }) {
    const o = this.getOrder(orderId);
    if (o.status !== 'placed' && o.status !== 'partially_refunded') {
      throw new RefundError(`Order ${orderId} cannot be refunded in status ${o.status}`);
    }
    if (typeof date !== 'string' || !DATE_RE.test(date) || date < o.date) {
      throw new RefundError('Invalid refund date');
    }

    const mergedItems = new Map();
    for (const { sku, qty } of items) {
      if (!Number.isInteger(qty) || qty <= 0) throw new RefundError('Invalid quantity');
      mergedItems.set(sku, (mergedItems.get(sku) ?? 0) + qty);
    }
    if (mergedItems.size === 0) throw new RefundError('Items must be non-empty');

    const refundLines = [];
    for (const [sku, qty] of mergedItems) {
      const line = o.lines.find(l => l.sku === sku);
      if (!line) throw new RefundError(`SKU ${sku} not in order`);
      if (qty > (line.qty - line.refundedQty)) {
        throw new RefundError(`Too many units of ${sku} being refunded`);
      }
      
      let refundNet, refundTax;
      if (line.refundedQty + qty === line.qty) {
        refundNet = line.netCents - line.refundedNetCents;
        refundTax = line.taxCents - line.refundedTaxCents;
      } else {
        refundNet = roundHalfAwayFromZero(line.netCents * qty / line.qty);
        refundTax = roundHalfAwayFromZero(line.taxCents * qty / line.qty);
      }
      
      refundLines.push({ sku, qty, netCents: refundNet, taxCents: refundTax, totalCents: refundNet + refundTax });
    }

    // Apply effects
    for (const rl of refundLines) {
      const line = o.lines.find(l => l.sku === rl.sku);
      line.refundedQty += rl.qty;
      line.refundedNetCents += rl.netCents;
      line.refundedTaxCents += rl.taxCents;
      if (restock) {
        this.inventory.release(rl.sku, rl.qty);
      }
    }

    const allRefunded = o.lines.every(l => l.refundedQty === l.qty);
    o.status = allRefunded ? 'refunded' : 'partially_refunded';

    const refundId = `R${String(this.nextRefundNo++).padStart(4, '0')}`;
    const refundRecord = {
      id: refundId,
      orderId: o.id,
      date,
      lines: refundLines,
      totalCents: refundLines.reduce((sum, l) => sum + l.totalCents, 0)
    };
    o.refunds.push(refundRecord);

    return refundRecord;
  }

  listOrders() {
    return [...this.orders.values()];
  }
}

module.exports = { OrderService, OrderError, RefundError };
