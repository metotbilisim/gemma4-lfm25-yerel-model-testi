'use strict';

const { VAT_RATES } = require('./pricing');

/** Daily sales report (SPEC section 9). */
function dailySales(orderService, date) {
  const byCategory = {};
  for (const cat of Object.keys(VAT_RATES)) byCategory[cat] = { netCents: 0, taxCents: 0 };
  let orders = 0;
  let totalCents = 0;
  let refundsCents = 0;

  // 9.1 & 9.2: Sales are attributed to the order date
  for (const o of orderService.listOrders()) {
    if (o.date !== date || o.status === 'cancelled') continue;
    orders++;
    for (const l of o.lines) {
      byCategory[l.category].netCents += l.netCents;
      byCategory[l.category].taxCents += l.taxCents;
      totalCents += l.totalCents;
    }
  }

  // 9.1 & 9.2: Refunds are attributed to the refund date
  for (const o of orderService.listOrders()) {
    for (const r of o.refunds) {
      if (r.date !== date) continue;
      refundsCents += r.totalCents;
      for (const rl of r.lines) {
        // Find the category of the SKU in the original order
        // We need to find the line in the order to get its category
        const originalLine = o.lines.find(l => l.sku === rl.sku);
        if (originalLine) {
          byCategory[originalLine.category].netCents -= rl.netCents;
          byCategory[originalLine.category].taxCents -= rl.taxCents;
        }
      }
    }
  }

  return {
    date,
    orders,
    byCategory,
    refundsCents,
    totalCents: totalCents - refundsCents
  };
}

module.exports = { dailySales };
