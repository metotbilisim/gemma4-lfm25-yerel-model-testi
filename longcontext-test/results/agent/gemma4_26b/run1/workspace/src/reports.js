'use strict';

const { VAT_RATES } = require('./pricing');

/** Daily sales report (SPEC section 9). */
function dailySales(orderService, date) {
  const byCategory = {};
  for (const cat of Object.keys(VAT_RATES)) byCategory[cat] = { netCents: 0, taxCents: 0 };
  let orders = 0;
  let totalCents = 0;
  let refundsCents = 0;

  // 9.2 Sales are attributed to the order date
  for (const o of orderService.listOrders()) {
    if (o.date !== date || o.status === 'cancelled') continue;
    orders++;
    for (const l of o.lines) {
      byCategory[l.category].netCents += l.netCents;
      byCategory[l.category].taxCents += l.taxCents;
      totalCents += l.totalCents;
    }
  }

  // 9.2 Refunds are attributed to the refund date
  // We assume orderService has a 'refunds' array as implemented in src/orders.js
  if (orderService.refunds) {
    for (const r of orderService.refunds) {
      if (r.date === date) {
        refundsCents += r.totalCents;
        totalCents -= r.totalCents;
        for (const rl of r.lines) {
          // rl.category was added to refund lines in src/orders.js
          if (rl.category) {
            byCategory[rl.category].netCents -= rl.netCents;
            byCategory[rl.category].taxCents -= rl.taxCents;
          }
        }
      }
    }
  }

  return { date, orders, byCategory, refundsCents, totalCents };
}

module.exports = { dailySales };
