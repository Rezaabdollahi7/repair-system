export type PaymentStatus = "paid" | "partial" | "pending";

/**
 * Shared by the purchase and sale invoice controllers, which derived this
 * with the same nested conditional.
 */
export function paymentStatusFor(
  paidAmount: number,
  totalAmount: number,
): PaymentStatus {
  if (paidAmount >= totalAmount) return "paid";
  if (paidAmount > 0) return "partial";
  return "pending";
}
