import type { RepairInvoiceStatus } from "../generated/prisma/client";

/**
 * Which way a status change moves the invoice's parts, if it may happen.
 *
 *   * `take`   — the parts leave the shelf (the invoice becomes real).
 *   * `return` — they come back (an invoice that took them is voided).
 *   * `null`   — no stock moves.
 */
export type StockEffect = "take" | "return" | null;

export type Transition =
  { allowed: true; stock: StockEffect } | { allowed: false; error: string };

/** The statuses under which an invoice is holding its parts. */
export function holdsStock(status: RepairInvoiceStatus): boolean {
  return status === "issued" || status === "paid";
}

/**
 * The rule for every status change, in one place (roadmap 14.7).
 *
 * The principle: stock leaves exactly once, on the way out of `draft`
 * (پیش‌فاکتور), whichever way the invoice leaves it, and comes back exactly
 * once, when an invoice holding it is cancelled. Two transitions broke that
 * until 14.7:
 *
 *   * issued → draft was allowed and moved nothing, so issuing again took
 *     the parts a second time. It is refused now: an issued invoice is
 *     corrected by cancelling it and issuing a new one.
 *   * draft → paid (possible with a zero total) moved nothing either, so an
 *     invoice could be paid with its parts still on the shelf — and deleting
 *     it later "returned" parts that had never left. It takes them now, as
 *     issuing does.
 */
export function repairInvoiceTransition(
  from: RepairInvoiceStatus,
  to: RepairInvoiceStatus,
): Transition {
  if (from === "cancelled") {
    return { allowed: false, error: "فاکتور ابطال شده قابل تغییر نیست" };
  }

  if (from === "paid" && to !== "paid") {
    return { allowed: false, error: "فاکتور پرداخت شده قابل تغییر نیست" };
  }

  if (from === "issued" && to === "draft") {
    return {
      allowed: false,
      error:
        "فاکتور صادرشده به پیش‌فاکتور برنمی‌گردد. برای اصلاح، آن را ابطال و فاکتور تازه صادر کنید",
    };
  }

  if (from === "draft" && (to === "issued" || to === "paid")) {
    return { allowed: true, stock: "take" };
  }

  if (to === "cancelled" && holdsStock(from)) {
    return { allowed: true, stock: "return" };
  }

  return { allowed: true, stock: null };
}
