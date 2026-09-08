/**
 * How much of an item is left, as three states.
 *
 * There were two copies of this before — `StockBadge` in the items list and
 * `getStockStatusBadge` in the stock report — and they disagreed on the
 * wording: the same item was «موجود» on one page and «موجودی کافی» on the
 * other. The backend already had the third copy, as `stockStatus()`.
 *
 * Unlike the repair statuses, these take the **reserved semantic colours**
 * rather than chart series slots, and that difference is the point. A repair
 * status is an identity — nine kinds of state, none better than another — so
 * colouring it good/warning/danger would have implied severities that do not
 * exist. Stock level is a severity: running out is bad, being below your own
 * minimum is a warning, and having enough is fine. That is exactly what
 * success/warning/danger are for, and spending a series slot on it instead
 * would have thrown away the meaning the reader already knows.
 */

export type StockStatusKey = "ok" | "low" | "out";

export interface StockStatus {
  key: StockStatusKey;
  label: string;
  /** The dot's colour and the tint's base — a semantic token. */
  color: string;
  /** Tailwind classes for a badge that carries the tone in its own text. */
  tone: string;
}

/** Worst first: this is the order a shop wants to read it in. */
export const STOCK_STATUSES: StockStatus[] = [
  {
    key: "out",
    label: "اتمام موجودی",
    color: "var(--danger)",
    tone: "bg-danger-soft text-danger-fg",
  },
  {
    key: "low",
    label: "کم‌موجود",
    color: "var(--warning)",
    tone: "bg-warning-soft text-warning-fg",
  },
  {
    key: "ok",
    label: "موجودی کافی",
    color: "var(--success)",
    tone: "bg-success-soft text-success-fg",
  },
];

const BY_KEY = new Map(STOCK_STATUSES.map((status) => [status.key, status]));

/**
 * Which bucket an item falls in.
 *
 * `out` is tested first on purpose: an item whose minimum is zero and whose
 * stock is zero has run out, and reading `current <= min` before that would
 * have called it merely low.
 */
export function stockStatusOf(current: number, min: number): StockStatus {
  if (current <= 0) return BY_KEY.get("out")!;
  if (current <= min) return BY_KEY.get("low")!;
  return BY_KEY.get("ok")!;
}

/**
 * The same three buckets as the server names them in the stock report, which
 * calls the empty one `critical` and the healthy one `good`.
 */
export function stockStatusOfKey(
  key: "critical" | "low" | "good",
): StockStatus {
  if (key === "critical") return BY_KEY.get("out")!;
  if (key === "low") return BY_KEY.get("low")!;
  return BY_KEY.get("ok")!;
}
