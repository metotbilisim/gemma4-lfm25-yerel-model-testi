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

test('BUG-103: Coupons stop working one day too early', () => {
  const { svc } = setup(undefined, [{ code: 'SUMMER', type: 'PERCENT', percent: 10, validTo: '2025-06-30' }]);
  // Should be usable on 2025-06-30
  const o = svc.createOrder({ customerId: 'c1', date: '2025-06-30', couponCode: 'SUMMER', lines: [{ sku: 'LAMP', qty: 1 }] });
  assert.strictEqual(o.couponCode, 'SUMMER');
  
  // Should NOT be usable on 2025-07-01
  const { CouponError } = lib;
  assert.throws(() => svc.createOrder({ customerId: 'c1', date: '2025-07-01', couponCode: 'SUMMER', lines: [{ sku: 'LAMP', qty: 1 }] }), CouponError);
});

test('BUG-104: Fixed-amount coupons split the discount correctly', () => {
  // Three equally priced lines: 1000, 1000, 1000. Total 3000.
  // Voucher 1000.
  // Expected: 333, 333, 334 (because 1000/3 = 333.333, 333, 333, 333. Remainder 1 goes to first one)
  // Wait, let's check the spec example: allocate(100, [1, 1, 1]) -> [34, 33, 33]
  // So for 1000, [1000, 1000, 1000], it should be [334, 333, 333].
  
  const catalog = new Catalog([
    { sku: 'ITEM', priceCents: 1000, category: 'general' },
  ]);
  const inventory = new Inventory({ ITEM: 10 });
  const coupons = [{ code: 'VOUCHER', type: 'FIXED', amountCents: 1000 }];
  const svc = new OrderService({ catalog, inventory, coupons });

  const o = svc.createOrder({ 
    customerId: 'c1', 
    date: '2025-05-01', 
    couponCode: 'VOUCHER', 
    lines: [{ sku: 'ITEM', qty: 3 }] 
  });

  // The lines are merged in createOrder? 
  // 7.2 Lines with the same SKU are merged into a single line.
  // If they are merged, there is only ONE line.
  // If there is only one line, the discount is just the amount.
  
  // Let's try with different SKUs to have multiple lines.
  const catalog2 = new Catalog([
    { sku: 'I1', priceCents: 1000, category: 'general' },
    { sku: 'I2', priceCents: 1000, category: 'general' },
    { sku: 'I3', priceCents: 1000, category: 'general' },
  ]);
  const inventory2 = new Inventory({ I1: 10, I2: 10, I3: 10 });
  const coupons2 = [{ code: 'VOUCHER', type: 'FIXED', amountCents: 1000 }];
  const svc2 = new OrderService({ catalog: catalog2, inventory: inventory2, coupons: coupons2 });

  const o2 = svc2.createOrder({ 
    customerId: 'c1', 
    date: '2025-05-01', 
    couponCode: 'VOUCHER', 
    lines: [{ sku: 'I1', qty: 1 }, { sku: 'I2', qty: 1 }, { sku: 'I3', qty: 1 }] 
  });

  assert.strictEqual(o2.lines[0].discountCents, 334);
  assert.strictEqual(o2.lines[1].discountCents, 333);
  assert.strictEqual(o2.lines[2].discountCents, 333);
});
