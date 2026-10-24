'use strict';

const VAT_RATES = { food: 10, books: 0, general: 20 };

function roundHalfAwayFromZero(x) {
  return Math.sign(x) * Math.round(Math.abs(x));
}

/** Returns `percent`% of `cents`, rounded half away from zero. */
function percentOf(cents, percent) {
  return roundHalfAwayFromZero((cents * percent) / 100);
}

/**
 * Formats cents as a string such as "€12.05" or "-€0.40".
 */
function format(cents) {
  const sign = cents < 0 ? '-' : '';
  const a = Math.abs(cents);
  return `${sign}€${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

/**
 * Splits `totalCents` across `weights` proportionally so that the parts sum exactly to totalCents.
 * Uses the largest-remainder method (SPEC section 2.3).
 */
function allocate(totalCents, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);
  const parts = weights.map((w) => Math.floor((totalCents * w) / sum));
  let remainder = totalCents - parts.reduce((a, b) => a + b, 0);
  // Distribute the remaining cents to the parts with the largest fractional remainders,
  // breaking ties in favour of earlier indices.
  const indexed = weights.map((w, i) => {
    const num = totalCents * w;
    return { i, remainder: num % sum };
  });
  indexed.sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return a.i - b.i;
  });
  for (let i = 0; i < remainder; i++) {
    parts[indexed[i].i]++;
  }
  return parts;
}

/**
 * CouponError — thrown when a coupon is invalid.
 */
class CouponError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CouponError';
  }
}

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
