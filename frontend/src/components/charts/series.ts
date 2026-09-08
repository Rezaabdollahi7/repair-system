/**
 * The chart series palette, and the rule for running out of it.
 *
 * Its own module rather than part of chartKit so that file exports only
 * components — a file mixing components with constants breaks Vite's fast
 * refresh, which is what the react-refresh lint rule is warning about.
 */

/**
 * The eight series slots, in fixed order.
 *
 * Assigned to series in sequence and never cycled: a ninth series does not
 * wrap around to slot 1 — it folds into "سایر" (see `foldToOther`). The order
 * is what makes adjacent pairs distinguishable under red-green colour
 * blindness, so it is not a list to reshuffle for taste.
 */
export const SERIES = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
] as const;

export const SERIES_LIMIT = SERIES.length;

/**
 * Keeps the largest `limit - 1` rows and sums the rest into one labelled
 * "سایر", so no chart ever needs a ninth colour.
 *
 * Returns the tail count too: a legend that says «سایر» without saying how
 * many things are in it is hiding the data rather than summarising it.
 */
export function foldToOther<T extends { value: number }>(
  rows: T[],
  limit = SERIES_LIMIT,
): { kept: T[]; other: number; otherCount: number } {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  if (sorted.length <= limit) return { kept: sorted, other: 0, otherCount: 0 };

  const kept = sorted.slice(0, limit - 1);
  const tail = sorted.slice(limit - 1);
  return {
    kept,
    other: tail.reduce((sum, row) => sum + row.value, 0),
    otherCount: tail.length,
  };
}
