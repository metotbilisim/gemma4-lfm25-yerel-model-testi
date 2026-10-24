'use strict';

const { VAT_RATES } = require('./pricing');

function dailySales(orderService, date) {
  const byCategory = {};
  for (const cat of Object.keys(VAT_RATES)) byCategory[cat] = { netCents: 0, taxCents: 0 };
  let orders = 0;
  let totalCents = 0;
  let refundsCents = 0;
  for (const o of orderService.listOrders()) {
    if (o.status === 'cancelled') continue;
    if (o.date === date) {
      orders++;
      for (const l of o.lines) {
        byCategory[l.category].netCents += l.netCents;
        byCategory[l.category].taxCents += l.taxCents;
        totalCents += l.totalCents;
      }
    }
    for (const r of o.refunds || []) {
      if (r.date !== date) continue;
      for (const rl of r.lines) {
        const cat = o.lines.find((l) => l.sku === rl.sku).category;
        byCategory[cat].netCents -= rl.netCents;
        byCategory[cat].taxCents -= rl.taxCents;
        totalCents -= rl.totalCents;
        refundsCents += rl.totalCents;
      }
    }
  }
  return { date, orders, byCategory, refundsCents, totalCents };
}

module.exports = { dailySales };
