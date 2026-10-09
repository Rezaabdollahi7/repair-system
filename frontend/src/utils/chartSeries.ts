/**
 * The chart series palette, and the rule for running out of it.
 *
 * In utils rather than beside the charts because it is a constants file, not
 * a component — the charts read it, and so does the device-status map, which
 * pins each repair state to one of these slots.
 */

/**
 * The eight series slots, in fixed order.
 *
 * Assigned to series in sequence and never cycled: a ninth series does not
 * wrap around to slot 1 — it folds into a summed "سایر" entry, or the chart
 * carries fewer series.
 *
 * The order is not a matter of taste. It is what makes *adjacent* pairs
 * distinguishable under red-green colour blindness, and it was arrived at by
 * validating them — so a chart that lays these out in some other sequence has
 * to re-validate that sequence, not assume it holds. Two attempts at a
 * prettier order for the repair statuses both failed on exactly this.
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
