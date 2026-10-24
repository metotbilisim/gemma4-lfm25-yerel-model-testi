'use strict';

/**
 * Money helpers. All amounts in this code base are integer cents (EUR).
 * See docs/SPEC.md section 2 for the rounding and allocation rules.
 */

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

module.exports = { roundHalfAwayFromZero, percentOf, format, allocate };
