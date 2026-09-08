import { SERIES } from "./chartSeries";

/**
 * The repair workflow's states, in one place.
 *
 * There were six copies of this map before — in the devices list, the device
 * form, the device detail modal, the filter panel, the customer detail modal
 * and the dashboard — and they had already drifted apart: the same job showed
 * as «تعمیر شد» in one and «تعمیر شده» in another, and `repairing` was tinted
 * as a warning in one place and as neutral in the next. A status is one thing
 * with one name and one colour, so it is defined once.
 *
 * `received`, the schema default, is deliberately absent, as it was before.
 * Anything unrecognised falls back through `deviceStatusOf`.
 */

/**
 * Order matters twice over.
 *
 * It is the workflow order, which is how the filter chips and the dashboard's
 * ring read — a job moves down this list. And because the colours are the
 * chart series slots taken in sequence, it is also what keeps neighbouring
 * states distinguishable under colour blindness: the slot order is the
 * safety mechanism. Reordering these rows means re-validating the palette,
 * not just moving lines.
 *
 * `unrepairable` sits after `diagnosing` rather than at the end for both
 * reasons: that is when a shop discovers a job cannot be saved, and putting
 * it last left the reserved red adjacent to the gold of `pending` where the
 * ring closes, a pair that fails the colour-blindness check.
 */
export interface DeviceStatus {
  key: string;
  label: string;
  /** A CSS colour — a custom property, so it follows the theme. */
  color: string;
}

export const DEVICE_STATUSES: DeviceStatus[] = [
  { key: "pending", label: "در انتظار بررسی", color: SERIES[0] },
  { key: "diagnosing", label: "در حال بررسی", color: SERIES[1] },
  /*
   * The one state that takes a reserved colour rather than a series slot:
   * a job that cannot be repaired is an outcome, not another step, and it is
   * the row a shop wants to pick out of a list. It carries its label
   * everywhere it appears, as a status colour must.
   */
  { key: "unrepairable", label: "غیرقابل تعمیر", color: "var(--device-dead)" },
  { key: "waiting_for_parts", label: "در انتظار قطعه", color: SERIES[2] },
  { key: "repairing", label: "در حال تعمیر", color: SERIES[3] },
  { key: "repaired", label: "تعمیر شده", color: SERIES[4] },
  { key: "ready_for_pickup", label: "آماده تحویل", color: SERIES[5] },
  { key: "delivered", label: "تحویل داده شده", color: SERIES[6] },
  { key: "not_repaired", label: "تعمیر نشد", color: SERIES[7] },
];

const BY_KEY = new Map(DEVICE_STATUSES.map((status) => [status.key, status]));

/**
 * The row for a status key, or a neutral stand-in carrying the raw key.
 *
 * A workspace whose data holds a status this build does not know about —
 * `received`, or something added server-side later — still renders: it gets
 * the key as its label and the muted neutral, which reads as "unclassified"
 * rather than borrowing a colour that means something else.
 */
export function deviceStatusOf(key: string): DeviceStatus {
  return BY_KEY.get(key) ?? { key, label: key, color: "var(--text-muted)" };
}
