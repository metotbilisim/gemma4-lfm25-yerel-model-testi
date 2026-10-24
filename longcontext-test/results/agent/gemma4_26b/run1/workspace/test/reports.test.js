'use strict';

const test = require('node:test');
const assert = require('node:assert');
const lib = require('../src');

const { Catalog, Inventory, OrderService } = lib;

function setup(stock = { BOOK: 10, TEA: 10, LAMP: 10 }, coupons = []) {
  const catalog = new Catalog([
    { sku: 'BOOK', priceCents: 1500, category: 'books' },
    { sku: 'TEA', priceCents: 450, category: 'food' },
    { sku: 'LAMP', priceCents: 5000, category: 'general' },
  ]);
  const inventory = new Inventory(stock);
  return { inventory, svc: new OrderService({ catalog, inventory, coupons }) };
}

test('dailySales report with refunds', () => {
  const { svc } = setup();
  
  // Order 1: placed on 2025-05-01
  const o1 = svc.createOrder({ customerId: 'c1', date: '2025-05-01', lines: [{ sku: 'TEA', qty: 2 }] });
  // TEA: 450 * 2 = 900 gross. 
  // VAT 10% -> tax = 90. net = 900. total = 990.
  
  // Order 2: placed on 2025-05-01
  const o2 = svc.createOrder({ customerId: 'c2', date: '2025-05-01', lines: [{ sku: 'LAMP', qty: 1 }] });
  // LAMP: 5000 gross. VAT 20% -> tax = 1000. net = 5000. total = 6000.

  // Refund 1: on 2025-05-02 (different day)
  // Refund 1 unit of TEA
  // TEA: 450 gross. tax = 45. net = 450. total = 495.
  svc.refundOrder(o1.id, [{ sku: 'TEA', qty: 1 }], { date: '2025-05-02' });

  // Refund 2: on 2025-05-01 (same day)
  // Refund 1 unit of LAMP
  // LAMP: 5000 gross. tax = 1000. net = 5000. total = 6000.
  // Wait, if I refund the whole thing, it's easier.
  svc.refundOrder(o2.id, [{ sku: 'LAMP', qty: 1 }], { date: '2025-05-01' });

  // Report for 2025-05-01
  // Orders: o1, o2 (2 orders)
  // Sales:
  //   food: net 900, tax 90
  //   general: net 5000, tax 1000
  //   books: net 0, tax 0
  //   total: 900 + 90 + 5000 + 1000 = 6990
  // Refunds on 2025-05-01:
  //   o2 refund: total 6000.
  //   general: net -5000, tax -1000
  // Report 2025-05-01 results:
  //   orders: 2
  //   byCategory: { food: {900, 90}, general: {5000-5000, 1000-1000}, books: {0, 0} }
  //   refundsCents: 6000
  //   totalCents: 6990 - 6000 = 990
  
  const report1 = lib.dailySales(svc, '2025-05-01');
  assert.strictEqual(report1.orders, 2);
  assert.strictEqual(report1.byCategory.food.netCents, 900);
  assert.strictEqual(report1.byCategory.food.taxCents, 90);
  assert.strictEqual(report1.byCategory.general.netCents, 0);
  assert.strictEqual(report1.byCategory.general.taxCents, 0);
  assert.strictEqual(report1.refundsCents, 6000);
  assert.strictEqual(report1.totalCents, 990);

  // Report for 2025-05-02
  // Orders: 0
  // Refunds on 2025-05-02:
  //   o1 refund: total 495.
  //   food: net -450, tax -45
  // Report 2025-05-02 results:
  //   orders: 0
  //   byCategory: { food: {-450, -45}, general: {0, 0}, books: {0, 0} }
  //   refundsCents: 495
  //   totalCents: 0 - 495 = -495
  
  const report2 = lib.dailySales(svc, '2025-05-02');
  assert.strictEqual(report2.orders, 0);
  assert.strictEqual(report2.byCategory.food.netCents, -450);
  assert.strictEqual(report2.byCategory.food.taxCents, -45);
  assert.strictEqual(report2.refundsCents, 495);
  assert.strictEqual(report2.totalCents, -495);
});
