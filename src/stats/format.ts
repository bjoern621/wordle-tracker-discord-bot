// Formats computed figures into the short display strings the cards show. Kept
// apart from the aggregation in stats.ts so the numbers have one home and their
// presentation another.

/** Ratio in 0..1 as a whole-percent string: 0.5 -> "50%". */
export const pct = (x: number): string => `${Math.round(x * 100)}%`;

/** Number to fixed decimals, or "-" when absent. */
export const fixed = (x: number | null, d = 2): string => (x == null ? '-' : x.toFixed(d));

/** Opener strength as "n.n/5", or "-" when no grid was available. */
export const openerLabel = (n: number | null): string => (n == null ? '-' : `${n.toFixed(1)}/5`);

/**
 * A duration in seconds as a compact label: "45s", "2m 5s", "1h 3m", or "-" when
 * no timing was available. Rounds to whole seconds and drops a zero trailing unit.
 */
export function duration(seconds: number | null): string {
  if (seconds == null) return '-';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem ? `${m}m ${rem}s` : `${m}m`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}
