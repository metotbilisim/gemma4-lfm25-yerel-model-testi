'use strict';

const { CouponError, assertCouponUsable, priceLines, summarize } = require('./pricing');
const { roundHalfAwayFromZero, percentOf } = require('./money');
const { RefundError } = require('./index');
const { InventoryError } = require('./inventory');

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

    // Validate stock availability for all lines before reserving (atomic reservation)
    for (const l of merged) {
      if (this.inventory.available(l.sku) < l.qty) {
        throw new InventoryError(`Insufficient stock for ${l.sku}: requested ${l.qty}, available ${this.inventory.available(l.sku)}`);
      }
    }

    // Reserve all stock
    for (const l of merged) this.inventory.reserve(l.sku, l.qty);

    const priced = priceLines(merged, this.catalog, coupon);
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

  listOrders() {
    return [...this.orders.values()];
  }

  refundOrder(orderId, items, { date, restock = true } = {}) {
    const order = this.getOrder(orderId);
    if (order.status !== 'placed' && order.status !== 'partially_refunded') {
      throw new RefundError(`Cannot refund order ${orderId}: status is ${order.status}`);
    }

    // Validate date
    if (typeof date !== 'string' || !DATE_RE.test(date)) {
      throw new RefundError('refund date must be YYYY-MM-DD');
    }
    const orderDate = order.date;
    if (date < orderDate) {
      throw new RefundError('refund date cannot be earlier than order date');
    }

    // Validate items
    if (!Array.isArray(items) || items.length === 0) {
      throw new RefundError('refund items must be a non-empty array');
    }
    const mergedItems = new Map();
    for (const item of items) {
      if (!item.sku || typeof item.qty !== 'number' || !Number.isInteger(item.qty) || item.qty <= 0) {
        throw new RefundError(`Invalid refund item: ${JSON.stringify(item)}`);
      }
      const existing = mergedItems.get(item.sku);
      if (existing) {
        mergedItems.set(item.sku, existing + item.qty);
      } else {
        mergedItems.set(item.sku, item.qty);
      }
    }

    // Validate SKUs against order lines
    const lineMap = new Map();
    for (const l of order.lines) {
      lineMap.set(l.sku, l);
    }
    for (const [sku, qty] of mergedItems) {
      if (!lineMap.has(sku)) {
        throw new RefundError(`SKU ${sku} is not a line of the order`);
      }
    }

    // Validate refunded quantities
    for (const l of order.lines) {
      const refundedQty = mergedItems.get(l.sku) || 0;
      if (refundedQty > l.qty) {
        throw new RefundError(`Refunded quantity exceeds line qty for ${l.sku}`);
      }
    }

    // Compute refund amounts per line and update running totals
    const refundRecords = [];
    let totalCents = 0;
    for (const l of order.lines) {
      const qty = mergedItems.get(l.sku);
      if (!qty) continue;
      const grossCents = l.grossCents;
      const netCents = l.netCents;
      const taxCents = l.taxCents;
      let refundedNetCents, refundedTaxCents;
      if (l.qty - qty === 0) {
        // All units refunded: refund the full amount
        refundedNetCents = netCents;
        refundedTaxCents = taxCents;
      } else {
        // Refund proportional to the gross amount of the refunded units.
        // The discount is computed on the VAT-exclusive gross amount of each line,
        // so the refund is computed on that same gross amount.
        refundedNetCents = roundHalfAwayFromZero(grossCents * qty / l.qty);
        // Tax is computed on the net amount at the line's VAT rate
        refundedTaxCents = percentOf(refundedNetCents, taxCents > 0 ? 10 : 0);
      }
      // Update line running totals
      l.refundedNetCents = refundedNetCents;
      l.refundedTaxCents = refundedTaxCents;
      // totalCents is the amount being refunded for this line (net + tax)
      const refundAmount = refundedNetCents + refundedTaxCents;
      l.totalCents -= (refundedNetCents - netCents) + (refundedTaxCents - taxCents);
      totalCents += refundAmount;
      refundRecords.push({
        sku: l.sku,
        qty,
        netCents: refundedNetCents,
        taxCents: refundedTaxCents,
        totalCents: refundAmount,
      });
    }

    // Apply stock changes (release if restocking)
    if (restock) {
      for (const l of order.lines) {
        this.inventory.release(l.sku, mergedItems.get(l.sku));
      }
    }

    // Update order status: refunded only if every unit of every line has been refunded
    const totalRefundedQty = refundRecords.reduce((a, r) => a + r.qty, 0);
    const totalLineQty = order.lines.reduce((a, l) => a + l.qty, 0);
    order.status = totalRefundedQty === totalLineQty ? 'refunded' : 'partially_refunded';

    // Append refund record to the order
    order.refunds.push({
      id: `R${String(order.id).slice(1).padStart(3, '0')}`,
      orderId,
      date,
      lines: refundRecords.map(r => ({ sku: r.sku, qty: r.qty, netCents: r.netCents, taxCents: r.taxCents, totalCents: r.totalCents })),
      totalCents,
    });

    return order.refunds[order.refunds.length - 1];
  }
}

module.exports = { OrderService, OrderError };
