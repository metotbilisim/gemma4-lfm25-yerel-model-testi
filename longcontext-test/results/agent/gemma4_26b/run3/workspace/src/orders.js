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

      const priced = priceLines(merged, this.catalog, coupon);
      const id = `O${String(this.nextOrderNo++).padStart(4, '0')}`;
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
      
      // Initialize line running totals for refunds (SPEC 8.3)
      for (const l of order.lines) {
        l.refundedQty = 0;
        l.refundedNetCents = 0;
        l.refundedTaxCents = 0;
      }

      if (coupon) this.couponUsage.add(`${customerId}:${coupon.code}`);
      this.orders.set(id, order);
      return order;
    } catch (e) {
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
    for (const l of o.lines) this.inventory.release(l.sku, l.qty);
    o.status = 'cancelled';
    if (o.couponCode) this.couponUsage.delete(`${o.customerId}:${o.couponCode}`);
    return o;
  }

  refundOrder(orderId, items, { date, restock = true } = {}) {
    const order = this.orders.get(orderId);
    if (!order) {
      // SPEC 8.2: "An unknown order id may throw either OrderError or RefundError"
      // Let's throw OrderError if it's not even in the system, or RefundError if it's not in a refundable status.
      // Actually, let's just throw OrderError for unknown ID to be safe, or RefundError as allowed.
      throw new OrderError(`Unknown order: ${orderId}`);
    }

    if (order.status !== 'placed' && order.status !== 'partially_refunded') {
      throw new RefundError(`Order ${orderId} cannot be refunded in status ${order.status}`);
    }

    if (typeof date !== 'string' || !DATE_RE.test(date)) {
      throw new RefundError('date must be YYYY-MM-DD');
    }
    if (date < order.date) {
      throw new RefundError('refund date cannot be earlier than order date');
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new RefundError('items must be a non-empty array');
    }

    // Merge items with same SKU
    const mergedItemsMap = new Map();
    for (const item of items) {
      if (!item.sku || !Number.isInteger(item.qty) || item.qty <= 0) {
        throw new RefundError('each item must have a positive integer qty');
      }
      mergedItemsMap.set(item.sku, (mergedItemsMap.get(item.sku) ?? 0) + item.qty);
    }

    // Validation
    const refundLines = [];
    for (const [sku, qty] of mergedItemsMap) {
      const line = order.lines.find(l => l.sku === sku);
      if (!line) {
        throw new RefundError(`SKU ${sku} is not a line of this order`);
      }
      const stillRefundable = line.qty - line.refundedQty;
      if (qty > stillRefundable) {
        throw new RefundError(`Cannot refund more than ${stillRefundable} units of ${sku}`);
      }
      refundLines.push({ sku, qty, line });
    }

    // Calculate refund amounts (SPEC 8.3)
    const refundRecordLines = [];
    let totalRefundCents = 0;

    for (const { sku, qty, line } of refundLines) {
      let refundNet, refundTax;
      const newTotalRefundedQty = line.refundedQty + qty;

      if (newTotalRefundedQty === line.qty) {
        // All units of the line are being refunded
        refundNet = line.netCents - line.refundedNetCents;
        refundTax = line.taxCents - line.refundedTaxCents;
      } else {
        refundNet = roundHalfAwayFromZero((line.netCents * qty) / line.qty);
        refundTax = roundHalfAwayFromZero((line.taxCents * qty) / line.qty);
      }

      const refundTotal = refundNet + refundTax;
      refundRecordLines.push({ sku, qty, netCents: refundNet, taxCents: refundTax, totalCents: refundTotal });
      totalRefundCents += refundTotal;

      // Update line running totals (SPEC 8.4)
      line.refundedQty += qty;
      line.refundedNetCents += refundNet;
      line.refundedTaxCents += refundTax;
    }

    // Sort refund lines by SKU for consistency (not strictly required by spec but good practice)
    // Wait, SPEC 8.5 says "in the order of the merged items".
    // Let's re-order refundRecordLines based on their original order in order.lines
    refundRecordLines.sort((a, b) => order.lines.findIndex(l => l.sku === a.sku) - order.lines.findIndex(l => l.sku === b.sku));

    // Effects
    if (restock) {
      for (const { sku, qty } of refundLines) {
        this.inventory.release(sku, qty);
      }
    }

    // Update order status
    const allLinesRefunded = order.lines.every(l => l.refundedQty === l.qty);
    order.status = allLinesRefunded ? 'refunded' : 'partially_refunded';

    const refundRecord = {
      id: `R${String(this.nextRefundNo++).padStart(4, '0')}`,
      orderId: order.id,
      date,
      lines: refundRecordLines,
      totalCents: totalRefundCents
    };
    order.refunds.push(refundRecord);

    return refundRecord;
  }

  listOrders() {
    return [...this.orders.values()];
  }
}

module.exports = { OrderService, OrderError, RefundError };
