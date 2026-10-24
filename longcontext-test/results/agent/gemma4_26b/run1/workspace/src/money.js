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

/** Formats cents as a string such as "€12.05" or "-€0.40". */
function format(cents) {
  const sign = cents < 0 ? '-' : '';
  const a = Math.abs(cents);
  return `${sign}€${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

/**
 * Splits `totalCents` across `weights` proportionally so that the parts sum exactly to totalCents.
 * Uses the largest-remainder method (SPEC 2.3).
 */
function allocate(totalCents, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);

  // 1. Each part starts as floor(totalCents * weight / sum(weights))
  const parts = weights.map((w) => Math.floor((totalCents * w) / sum));
  
  // 2. Calculate missing cents and fractional remainders
  let missingCents = totalCents - parts.reduce((a, b) => a + b, 0);
  
  if (missingCents > 0) {
    // To avoid floating point issues, we use integer arithmetic for remainders.
    // remainder = (totalCents * weight) % sum
    const remainders = weights.map((w) => (totalCents * w) % sum);
    
    // 3. Hand out missing cents to parts with largest fractional remainders.
    // Ties are broken in favour of the part that appears earlier in the list.
    // We can achieve this by sorting indices by remainder descending, then by index ascending.
    const indices = weights.map((_, i) => i);
    indices.sort((a, b) => {
      if (remainders[b] !== remainders[a]) {
        return remainders[b] - remainders[a];
      }
      return a - b;
    });

    for (let i = 0; i < missingCents; i++) {
      parts[indices[i]]++;
    }
  }

  return parts;
}

module.exports = { roundHalfAwayFromZero, percentOf, format, allocate };
