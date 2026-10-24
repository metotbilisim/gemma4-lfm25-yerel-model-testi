'use strict';

const { percentOf, allocate, roundHalfAwayFromZero } = require('./money');

/** VAT rate in percent per product category (SPEC 5.1). */
const VAT_RATES = { food: 10, books: 0, general: 20 };

/** Date validation regex (SPEC section 6.2). */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class CouponError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CouponError';
  }
}

/**
 * Checks whether a coupon may be used (SPEC 6.2). Throws CouponError with a reason if not.
 * Dates are 'YYYY-MM-DD' strings, so they can be compared lexicographically.
 */
function assertCouponUsable(coupon, { date, subtotalCents, customerId, usedBy }) {
  if (coupon.validFrom && date < coupon.validFrom) throw new CouponError(`Coupon ${coupon.code} is not valid yet`);
  if (coupon.validTo && date >= coupon.validTo) throw new CouponError(`Coupon ${coupon.code} has expired`);
  if (coupon.minSubtotalCents && subtotalCents < coupon.minSubtotalCents) {
    throw new CouponError(`Coupon ${coupon.code} requires a subtotal of at least ${coupon.minSubtotalCents} cents`);
  }
  if (usedBy.has(`${customerId}:${coupon.code}`)) throw new CouponError(`Coupon ${coupon.code} was already used by ${customerId}`);
}

function appliesTo(coupon, category) {
  return !coupon.categories || coupon.categories.includes(category);
}

/**
 * Prices order lines (SPEC section 5 and 6).
 * @param lines   [{ sku, qty }] (already merged/validated)
 */
function priceLines(lines) {
  const priced = [];
  for (const l of lines) {
    const netCents = Math.round(l.netCents);
    const taxCents = Math.round(l.taxCents);
    priced.push({ ...l, netCents, taxCents });
  }
  return priced;
}

/**
 * @param {Array} lines
 */
function summarize(lines) {
  return {
    netCents: lines.reduce((a, l) => a + l.netCents, 0),
    taxCents: lines.reduce((a, l) => a + l.taxCents, 0)
  };
}

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

class OrderService {
  constructor({ catalog, inventory, coupons = [] }) {
    this.catalog = catalog;
    this.inventory = inventory;
    this.coupons = new Map(coupons.map((c) => [c.code, c]));
    this.orders = new Map();
    this.nextOrderNo = 1;
    this.couponUsage = new Set();
    this.refundNo = 1;
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

    // Validate stock availability for all lines before reserving (if inventory supports it)
    if (this.inventory.get) {
      for (const l of merged) {
        const available = this.inventory.get(l.sku);
        if (typeof available !== 'number' || available < l.qty) throw new OrderError(`Insufficient stock for ${l.sku}: have ${available}, need ${l.qty}`);
      }
    }

    // Reserve all lines atomically; if any fails, no stock is reserved
    let reserved = [];
    try {
      for (const l of merged) this.inventory.reserve(l.sku, l.qty);
      reserved = [...merged];
    } catch (e) {
      throw e;
    }

    const priced = priceLines(reserved);
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

  refundOrder(orderId, items, { date, restock = true }) {
    const order = this.getOrder(orderId);
    if (!order) throw new RefundError(`Unknown order: ${orderId}`);
    if (order.status !== 'placed' && order.status !== 'partially_refunded') throw new RefundError('Cannot refund a cancelled or fully refunded order');

    const { date: refundDate } = date || {};
    if (typeof date !== 'string' || !DATE_RE.test(date)) throw new RefundError('refund date must be YYYY-MM-DD');
    if (date && date < order.date) throw new RefundError('refund date cannot be earlier than the order date');

    const itemsMap = {};
    for (const it of items) {
      if (!it.sku || !it.qty || !Number.isInteger(it.qty) || it.qty <= 0) throw new RefundError(`Invalid refund item: ${JSON.stringify(it)}`);
      const existing = itemsMap[it.sku];
      itemsMap[it.sku] = { ...existing, qty: existing?.qty + it.qty };
    }

    for (const sku of Object.keys(itemsMap)) {
      const line = order.lines.find(l => l.sku === sku);
      if (!line) throw new RefundError(`SKU ${sku} is not a line of the order`);
      const refundedQty = itemsMap[sku].qty;
      if (refundedQty > line.qty) throw new RefundError(`Refund quantity for ${sku} exceeds available units`);
    }

    const remaining = {};
    for (const l of order.lines) {
      remaining[l.sku] = l.qty - (itemsMap[l.sku]?.qty ?? 0);
    }
    for (const sku of Object.keys(itemsMap)) {
      if (itemsMap[sku].qty > remaining[sku]) throw new RefundError(`Refund quantity for ${sku} exceeds refundable units`);
    }

    for (const l of order.lines) {
      const refundedQty = itemsMap[l.sku]?.qty ?? 0;
      if (refundedQty === l.qty) {
        l.refundedQty = refundedQty;
        l.refundedNetCents = Math.round(l.netCents - percentOf(l.netCents, l.vatRate) * refundedQty / l.qty);
        l.refundedTaxCents = Math.round(l.taxCents - percentOf(l.taxCents, l.vatRate) * refundedQty / l.qty);
      } else {
        l.refundedNetCents = roundHalfAwayFromZero(l.netCents * refundedQty / l.qty);
        l.refundedTaxCents = roundHalfAwayFromZero(l.taxCents * refundedQty / l.qty);
      }
    }

    for (const l of order.lines) {
      l.refundedNetCents = Math.round(l.refundedNetCents);
      l.refundedTaxCents = Math.round(l.refundedTaxCents);
    }

    if (restock) {
      for (const l of order.lines) {
        this.inventory.release(l.sku, l.refundedQty);
      }
    }

    const allRefunded = order.lines.every(l => l.refundedQty === l.qty);
    order.status = allRefunded ? 'refunded' : 'partially_refunded';

    const finalLines = [];
    for (const l of order.lines) {
      finalLines.push({
        sku: l.sku,
        qty: l.qty,
        netCents: Math.round(l.refundedNetCents),
        taxCents: Math.round(l.refundedTaxCents),
        totalCents: Math.round(l.refundedNetCents + l.refundedTaxCents),
      });
    }

    const refundId = `R${String(this.refundNo++).padStart(4, '0')}`;
    order.refunds.push({
      id: refundId,
      orderId: order.id,
      date: refundDate || order.date,
      lines: finalLines,
      totalCents: Math.round(order.lines.reduce((a, l) => a + l.refundedNetCents + l.refundedTaxCents, 0)),
    });

    return {
      id: refundId,
      orderId: order.id,
      date: refundDate || order.date,
      lines: finalLines,
      totalCents: Math.round(order.lines.reduce((a, l) => a + l.refundedNetCents + l.refundedTaxCents, 0)),
    };
  }
}

module.exports = { OrderService, OrderError, RefundError, DATE_RE };
