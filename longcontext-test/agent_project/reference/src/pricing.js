'use strict';

const { percentOf, allocate } = require('./money');

/** VAT rate in percent per product category (SPEC 5.1). */
const VAT_RATES = { food: 10, books: 0, general: 20 };

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
  if (coupon.validTo && date > coupon.validTo) throw new CouponError(`Coupon ${coupon.code} has expired`);
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
 * @param lines   [{ sku, qty }] (already merged, validated)
 * @param catalog Catalog
 * @param coupon  coupon object or null
 * @returns [{ sku, qty, category, unitPriceCents, grossCents, discountCents, netCents, vatRate, taxCents, totalCents }]
 */
function priceLines(lines, catalog, coupon) {
  const priced = lines.map(({ sku, qty }) => {
    const p = catalog.get(sku);
    const grossCents = p.priceCents * qty;
    return { sku, qty, category: p.category, unitPriceCents: p.priceCents, grossCents, discountCents: 0, vatRate: VAT_RATES[p.category] };
  });

  if (coupon) {
    if (coupon.type === 'PERCENT') {
      for (const l of priced) {
        if (!appliesTo(coupon, l.category)) continue;
        l.discountCents = percentOf(l.grossCents, coupon.percent);
      }
    } else if (coupon.type === 'FIXED') {
      const subtotal = priced.reduce((a, l) => a + l.grossCents, 0);
      const amount = Math.min(coupon.amountCents, subtotal);
      const parts = allocate(amount, priced.map((l) => l.grossCents));
      priced.forEach((l, i) => { l.discountCents = parts[i]; });
    } else if (coupon.type === 'BOGO') {
      for (const l of priced) {
        if (l.sku !== coupon.sku) continue;
        const freeUnits = Math.floor(l.qty / (coupon.buy + coupon.free)) * coupon.free;
        l.discountCents = freeUnits * l.unitPriceCents;
      }
    } else {
      throw new CouponError(`Unknown coupon type: ${coupon.type}`);
    }
  }

  for (const l of priced) {
    l.netCents = l.grossCents - l.discountCents;
    l.taxCents = percentOf(l.netCents, l.vatRate);
    l.totalCents = l.netCents + l.taxCents;
  }
  return priced;
}

function summarize(priced) {
  const sum = (k) => priced.reduce((a, l) => a + l[k], 0);
  return {
    subtotalCents: sum('grossCents'),
    discountCents: sum('discountCents'),
    netCents: sum('netCents'),
    taxCents: sum('taxCents'),
    totalCents: sum('totalCents'),
  };
}

module.exports = { VAT_RATES, CouponError, assertCouponUsable, priceLines, summarize };
