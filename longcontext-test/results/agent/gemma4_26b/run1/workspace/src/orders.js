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

/** Order life cycle (SPEC section 7). */
class OrderService {
  constructor({ catalog, inventory, coupons = [] }) {
    this.catalog = catalog;
    this.inventory = inventory;
    this.coupons = new Map(coupons.map((c) => [c.code, c]));
    this.orders = new Map();
    this.nextOrderNo = 1;
    this.nextRefundNo = 1;
    this.couponUsage = new Set(); // "customerId:CODE"
    this.refunds = []; // To keep track of all refunds for reports
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

    try {
      const priced = priceLines(merged, this.catalog, coupon);
      const id = `O${String(this.nextOrderNo++).padStart(4, '0')}`;
      
      // Initialize lines with refund tracking
      for (const l of priced) {
        l.refundedQty = 0;
        l.refundedNetCents = 0;
        l.refundedTaxCents = 0;
      }

      const order = { 
        id, 
        customerId, 
        date, 
        couponCode, 
        status: 'placed', 
        lines: priced, 
        totals: summarize(priced),
        refunds: []
      };

      if (coupon) this.couponUsage.add(`${customerId}:${coupon.code}`);
      this.orders.set(id, order);
      return order;
    } catch (e) {
      // If something fails after reservation, release stock.
      for (const l of reserved) {
        this.inventory.release(l.sku, l.qty);
      }
      throw e;
    }
  }

  getOrder(id) {
    const o = this.orders.get(id);
    if (!o) throw new OrderError(`Unknown order: ${id}`);
    return o;
  }

  cancelOrder(id) {
    const o = this.getOrder(id);
    if (o.status !== 'placed') throw new OrderError(`Order ${id} cannot be cancelled in status ${o.status}`);
    // Spec 7.6: Orders that have any refund can no longer be cancelled.
    if (o.refunds.length > 0) throw new OrderError(`Order ${id} has refunds and cannot be cancelled`);
    
    for (const l of o.lines) this.inventory.release(l.sku, l.qty);
    o.status = 'cancelled';
    if (o.couponCode) this.couponUsage.delete(`${o.customerId}:${o.couponCode}`);
    return o;
  }

  refundOrder(orderId, items, { date, restock = true } = {}) {
    let order;
    try {
      order = this.getOrder(orderId);
    } catch (e) {
      // Spec 8.2: An unknown order id may throw either OrderError or RefundError.
      // Since getOrder throws OrderError, we just let it propagate.
      throw e;
    }
    
    // Validation (Spec 8.2)
    if (order.status !== 'placed' && order.status !== 'partially_refunded') {
      throw new RefundError(`Order ${orderId} is in status ${order.status} and cannot be refunded`);
    }
    if (typeof date !== 'string' || !DATE_RE.test(date)) throw new RefundError('Invalid refund date');
    if (date < order.date) throw new RefundError('Refund date cannot be earlier than order date');
    if (!Array.isArray(items) || items.length === 0) throw new RefundError('Items must be a non-empty array');

    // Merge items (Spec 8.2)
    const mergedItems = new Map();
    for (const { sku, qty } of items) {
      if (!Number.isInteger(qty) || qty <= 0) throw new RefundError(`Invalid quantity for ${sku}`);
      mergedItems.set(sku, (mergedItems.get(sku) ?? 0) + qty);
    }

    const refundLines = [];
    for (const [sku, qty] of mergedItems) {
      const line = order.lines.find(l => l.sku === sku);
      if (!line) throw new RefundError(`SKU ${sku} is not part of order ${orderId}`);
      if (qty > (line.qty - line.refundedQty)) {
        throw new RefundError(`Cannot refund more than ${line.qty - line.refundedQty} units of ${sku}`);
      }
      refundLines.push({ sku, qty, line });
    }

    // Perform refund (Spec 8.3 & 8.4)
    const refundRecordLines = [];
    let totalRefundCents = 0;

    for (const { sku, qty, line } of refundLines) {
      let rNet, rTax;
      if (line.refundedQty + qty === line.qty) {
        // All units will have been refunded
        rNet = line.netCents - line.refundedNetCents;
        rTax = line.taxCents - line.refundedTaxCents;
      } else {
        rNet = roundHalfAwayFromZero(line.netCents * qty / line.qty);
        rTax = roundHalfAwayFromZero(line.taxCents * qty / line.qty);
      }

      line.refundedQty += qty;
      line.refundedNetCents += rNet;
      line.refundedTaxCents += rTax;

      if (restock) {
        this.inventory.release(sku, qty);
      }

      const rTotal = rNet + rTax;
      refundRecordLines.push({ 
        sku, 
        qty, 
        category: line.category, 
        netCents: rNet, 
        taxCents: rTax, 
        totalCents: rTotal 
      });
      totalRefundCents += rTotal;
    }

    // Update order status (Spec 8.4)
    const allRefunded = order.lines.every(l => l.refundedQty === l.qty);
    order.status = allRefunded ? 'refunded' : 'partially_refunded';

    // Create refund record (Spec 8.5)
    const refundId = `R${String(this.nextRefundNo++).padStart(4, '0')}`;
    const refundRecord = {
      id: refundId,
      orderId,
      date,
      lines: refundRecordLines,
      totalCents: totalRefundCents
    };
    order.refunds.push(refundRecord);
    this.refunds.push(refundRecord);

    return refundRecord;
  }

  listOrders() {
    return [...this.orders.values()];
  }
}

module.exports = { OrderService, OrderError, RefundError };
