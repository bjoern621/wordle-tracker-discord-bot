// Formats computed figures into the short display strings the cards show. Kept
// apart from the aggregation in stats.ts so the numbers have one home and their
// presentation another.

/** Ratio in 0..1 as a whole-percent string: 0.5 -> "50%". */
export const pct = (x: number): string => `${Math.round(x * 100)}%`;

/** Number to fixed decimals, or "-" when absent. */
export const fixed = (x: number | null, d = 2): string => (x == null ? '-' : x.toFixed(d));

/** Best (fewest) guesses as "n/6", or "-" when the player has no win. */
export const bestLabel = (n: number | null): string => (n == null ? '-' : `${n}/6`);

/** Opener strength as "n.n/5", or "-" when no grid was available. */
export const openerLabel = (n: number | null): string => (n == null ? '-' : `${n.toFixed(1)}/5`);
