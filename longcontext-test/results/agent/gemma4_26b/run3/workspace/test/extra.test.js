'use strict';

const assert = require('node:assert');
const test = require('node:test');
const { Catalog } = require('../src/catalog');
const { Inventory } = require('../src/inventory');
const { OrderService, OrderError, RefundError } = require('../src/orders');
const { dailySales } = require('../src/reports');

// Helper to create a basic setup
function setup() {
  const catalog = new Catalog([
    { sku: 'SKU1', name: 'Product 1', priceCents: 1000, category: 'general' },
    { sku: 'SKU2', name: 'Product 2', priceCents: 2000, category: 'food' },
    { sku: 'SKU3', name: 'Product 3', priceCents: 500, category: 'books' },
  ]);
  const inventory = new Inventory({
    'SKU1': 10,
    'SKU2': 10,
    'SKU3': 10,
  });
  const coupons = [
    { code: 'PERCENT10', type: 'PERCENT', percent: 10 },
    { code: 'FIXED10', type: 'FIXED', amountCents: 1000 },
    { code: 'BOGO1', type: 'BOGO', sku: 'SKU1', buy: 1, free: 1 },
    { code: 'VALID_UNTIL_30', type: 'PERCENT', percent: 10, validTo: '2025-06-30' },
  ];
  const svc = new OrderService({ catalog, inventory, coupons });
  return { svc, catalog, inventory };
}

test('BUG-103: coupon is valid on its validTo date', () => {
  const { svc } = setup();
  const order = svc.createOrder({
    customerId: 'C1',
    lines: [{ sku: 'SKU1', qty: 1 }],
    couponCode: 'VALID_UNTIL_30',
    date: '2025-06-30'
  });
  assert.strictEqual(order.couponCode, 'VALID_UNTIL_30');
});

test('BUG-103: coupon is expired after its validTo date', () => {
  const { svc } = setup();
  assert.throws(() => {
    svc.createOrder({
      customerId: 'C1',
      lines: [{ sku: 'SKU1', qty: 1 }],
      couponCode: 'VALID_UNTIL_30',
      date: '2025-07-01'
    });
  }, { name: 'CouponError' });
});

test('BUG-104: FIXED coupon allocation follows largest remainder method', () => {
  const { svc } = setup();
  // Add more SKUs for testing allocation
  svc.catalog.add({ sku: 'SKU4', name: 'Product 4', priceCents: 1000, category: 'general' });
  svc.inventory.release('SKU4', 10);
  svc.catalog.add({ sku: 'SKU5', name: 'Product 5', priceCents: 1000, category: 'general' });
  svc.inventory.release('SKU5', 10);
  svc.catalog.add({ sku: 'SKU6', name: 'Product 6', priceCents: 1000, category: 'general' });
  svc.inventory.release('SKU6', 10);

  // Order: SKU1, SKU4, SKU5. All 1000 cents. Total 3000.
  // Coupon: FIXED10 (1000 cents).
  // Expected: 1000 / 3 = 333.333...
  // parts = [333, 333, 333], missing = 1.
  // remainder for each is (1000 * 1000) % 3000 = 1000.
  // All remainders are 1000. Tie goes to index 0.
  // Result: [334, 333, 333].

  const order = svc.createOrder({
    customerId: 'C1',
    lines: [{ sku: 'SKU1', qty: 1 }, { sku: 'SKU4', qty: 1 }, { sku: 'SKU5', qty: 1 }],
    couponCode: 'FIXED10',
    date: '2025-01-01'
  });

  assert.strictEqual(order.lines[0].discountCents, 334);
  assert.strictEqual(order.lines[1].discountCents, 333);
  assert.strictEqual(order.lines[2].discountCents, 333);
});

test('BOGO coupon works correctly', () => {
  const { svc } = setup();
  // BOGO1: SKU1, buy 1, get 1 free.
  // Order 2 units of SKU1.
  const order = svc.createOrder({
    customerId: 'C1',
    lines: [{ sku: 'SKU1', qty: 2 }],
    couponCode: 'BOGO1',
    date: '2025-01-01'
  });
  // SKU1 price is 1000. 2 units.
  // discount = floor(2 / (1+1)) * 1 * 1000 = 1 * 1 * 1000 = 1000.
  assert.strictEqual(order.lines[0].discountCents, 1000);
  assert.strictEqual(order.lines[0].netCents, 1000);
});

test('refundOrder validation: invalid date', () => {
  const { svc } = setup();
  const order = svc.createOrder({
    customerId: 'C1',
    lines: [{ sku: 'SKU1', qty: 1 }],
    date: '2025-01-02'
  });
  assert.throws(() => {
    svc.refundOrder(order.id, [{ sku: 'SKU1', qty: 1 }], { date: '2025-01-01' });
  }, { name: 'RefundError' });
});

test('refundOrder validation: SKU not in order', () => {
  const { svc } = setup();
  const order = svc.createOrder({
    customerId: 'C1',
    lines: [{ sku: 'SKU1', qty: 1 }],
    date: '2025-01-02'
  });
  assert.throws(() => {
    svc.refundOrder(order.id, [{ sku: 'SKU2', qty: 1 }], { date: '2025-01-02' });
  }, { name: 'RefundError' });
});

test('refundOrder validation: too many units', () => {
  const { svc } = setup();
  const order = svc.createOrder({
    customerId: 'C1',
    lines: [{ sku: 'SKU1', qty: 1 }],
    date: '2025-01-02'
  });
  assert.throws(() => {
    svc.refundOrder(order.id, [{ sku: 'SKU1', qty: 2 }], { date: '2025-01-02' });
  }, { name: 'RefundError' });
});

test('dailySales: refunds on different day', () => {
  const { svc } = setup();
  const order = svc.createOrder({
    customerId: 'C1',
    lines: [{ sku: 'SKU1', qty: 1 }],
    date: '2025-01-01'
  });
  // Order on 2025-01-01
  // Refund on 2025-01-02
  svc.refundOrder(order.id, [{ sku: 'SKU1', qty: 1 }], { date: '2025-01-02' });

  const reportDay1 = dailySales(svc, '2025-01-01');
  assert.strictEqual(reportDay1.orders, 1);
  assert.strictEqual(reportDay1.totalCents, 1200); // 1000 + 200 tax

  const reportDay2 = dailySales(svc, '2025-01-02');
  assert.strictEqual(reportDay2.orders, 0);
  assert.strictEqual(reportDay2.refundsCents, 1200);
  assert.strictEqual(reportDay2.totalCents, -1200);
  assert.strictEqual(reportDay2.byCategory.general.netCents, -1000);
  assert.strictEqual(reportDay2.byCategory.general.taxCents, -200);
});
