'use strict';

const { CouponError, assertCouponUsable, priceLines, summarize, roundHalfAwayFromZero } = require('./pricing');
const { InventoryError } = require('./inventory');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

/** Order life cycle (SPEC section 7). */
class OrderService {
  constructor({ catalog, inventory, coupons = [] }) {
    this.catalog = catalog;
    this.inventory = inventory;
    this.orders = new Map();
    this.nextOrderNo = 1;
    this.couponUsage = new Set();
    this.coupons = new Map();
    if (coupons.length > 0) {
      for (const c of coupons) {
        this.coupons.set(c.code, c);
      }
    }
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

    for (const l of merged) {
      if (this.inventory.available(l.sku) < l.qty) {
        throw new InventoryError(`Insufficient stock for ${l.sku}: requested ${l.qty}, available ${this.inventory.available(l.sku)}`);
      }
    }

    for (const l of merged) this.inventory.reserve(l.sku, l.qty);

    const priced = priceLines(merged, this.catalog, coupon);
    const id = `O${String(this.nextOrderNo++).padStart(4, '0')}`;
    const order = { id, customerId, date, couponCode, status: 'placed', lines: priced, totals: summarize(priced) };
    if (coupon) this.couponUsage.add(`${customerId}:${coupon.code}`);
    this.orders.set(id, order);

    // Attach refund method to the order object
    order.refund = function({ date: d, items: it, restock = true } = {}) {
      return this.refundOrder(this.id, it, { date: d, restock });
    };

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

  refundOrder(orderId, items, { date, restock = true } = {}) {
    const order = this.getOrder(orderId);
    if (order.status !== 'placed' && order.status !== 'partially_refunded') {
      throw new RefundError(`Cannot refund order ${orderId}: status is ${order.status}`);
    }

    if (typeof date !== 'string' || !DATE_RE.test(date)) {
      throw new RefundError('refund date must be YYYY-MM-DD');
    }
    const orderDate = order.date;
    if (date < orderDate) {
      throw new RefundError('refund date cannot be earlier than the order date');
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new RefundError('items must be a non-empty array');
    }
    for (const it of items) {
      if (!Number.isInteger(it.qty) || it.qty <= 0) {
        throw new RefundError('each item qty must be a positive integer');
      }
    }

    const merged = new Map();
    for (const it of items) {
      if (!merged.has(it.sku)) merged.set(it.sku, 0);
      merged.get(it.sku) += it.qty;
    }

    const orderLineSkus = new Set(order.lines.map(l => l.sku));
    for (const sku of merged.keys()) {
      if (!orderLineSkus.has(sku)) {
        throw new RefundError(`SKU ${sku} is not a line of the order`);
      }
    }

    const refundRecords = [];
    let refundNet = 0;
    let refundTax = 0;

    for (const l of order.lines) {
      const qty = merged.get(l.sku);
      if (!qty) continue;
      const line = { sku: l.sku, qty: qty, netCents: l.netCents, taxCents: l.taxCents, totalCents: l.totalCents };
      let refundedNet, refundedTax;

      if (l.qty - qty === 0) {
        refundedNet = l.netCents;
        refundedTax = l.taxCents;
      } else {
        refundedNet = roundHalfAwayFromZero(l.netCents * qty / l.qty);
        refundedTax = roundHalfAwayFromZero(l.taxCents * qty / l.qty);
      }

      line.refundedQty = qty;
      line.refundedNetCents = refundedNet;
      line.refundedTaxCents = refundedTax;
      refundRecords.push(line);
      refundNet += refundedNet;
      refundTax += refundedTax;
    }

    if (restock) {
      for (const l of order.lines) {
        const qty = merged.get(l.sku);
        if (qty) this.inventory.release(l.sku, qty);
      }
    }

    const allRefunded = refundRecords.every(r => r.refundedQty === r.qty);
    order.status = allRefunded ? 'refunded' : 'partially_refunded';

    const refundRecord = {
      id: `R${String(this.nextOrderNo++).padStart(4, '0')}`,
      orderId: orderId,
      date,
      lines: refundRecords,
      totalCents: refundNet + refundTax,
    };

    this.refunds.push(refundRecord);
    return refundRecord;
  }
}

module.exports = { OrderService, OrderError, RefundError };
