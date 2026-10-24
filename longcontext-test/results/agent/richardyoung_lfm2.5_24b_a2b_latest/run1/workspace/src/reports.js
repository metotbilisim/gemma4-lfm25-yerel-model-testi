'use strict';

const { VAT_RATES } = require('./pricing');

/** Daily sales report (SPEC section 9). */
function dailySales(orderService, date) {
  const byCategory = {};
  for (const cat of Object.keys(VAT_RATES)) byCategory[cat] = { netCents: 0, taxCents: 0 };
  let orders = 0;
  let totalCents = 0;
  for (const o of orderService.listOrders()) {
    if (o.date !== date || o.status === 'cancelled') continue;
    orders++;
    for (const l of o.lines) {
      byCategory[l.category].netCents += l.netCents;
      byCategory[l.category].taxCents += l.taxCents;
      totalCents += l.totalCents;
    }
  }
  // Refunds on this date: subtract from the refunded line's category
  let refundsCents = 0;
  for (const o of orderService.listOrders()) {
    if (o.date !== date || o.status === 'cancelled') continue;
    for (const r of (o.refunds || [])) {
      const line = o.lines.find((l) => l.sku === r.sku);
      if (!line) continue;
      byCategory[line.category].netCents -= r.netCents;
      byCategory[line.category].taxCents -= r.taxCents;
      refundsCents += r.totalCents;
      totalCents -= r.totalCents;
    }
  }
  return { date, orders, byCategory, refundsCents, totalCents };
}

module.exports = { dailySales };
