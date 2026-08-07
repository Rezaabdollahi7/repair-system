/**
 * The day window used by the daily invoice counter. UTC rather than local
 * time, matching the date stamp in the number itself — which means the
 * counter resets at 03:30 Tehran time. Existing behaviour, preserved.
 */
import { todayRange } from "./dateRange";
export { todayRange };

export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * Builds an invoice number like PUR-20260806-003 from a prefix and the count
 * of invoices already issued today.
 *
 * Racy by construction: two concurrent requests can read the same count. The
 * unique constraint on invoice_number turns that into a failed insert rather
 * than a duplicate number. A database sequence would fix it properly.
 */
export function buildInvoiceNumber(
  prefix: string,
  todayCount: number,
  padding = 3,
): string {
  return `${prefix}-${todayStamp()}-${String(todayCount + 1).padStart(padding, "0")}`;
}
