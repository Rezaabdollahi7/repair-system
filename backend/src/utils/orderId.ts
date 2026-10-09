import { randomBytes } from "node:crypto";

/**
 * Our own reference for a payment, sent to Zibal and shown in their reports.
 *
 * Carries the workspace because that is what a payment has to be matched
 * back to when someone calls about one — Zibal's panel shows this string and
 * nothing else of ours.
 *
 * Random tail rather than a counter: a counter would need a row lock the way
 * invoice numbers do, and unlike an invoice number this is not accounting
 * data that has to be gap-free. Nothing reads it but us and Zibal's reports.
 */
export function generateOrderId(workspaceId: number, prefix = "DFX"): string {
  return `${prefix}-${workspaceId}-${randomBytes(6).toString("hex")}`;
}

/**
 * The prefixes in use, so the two kinds of purchase are tellable apart at a
 * glance in Zibal's panel — which is the only place somebody matches a
 * transaction back to a workshop by hand.
 */
export const ORDER_PREFIX = {
  /** A subscription payment. */
  SUBSCRIPTION: "DFX",
  /** An SMS wallet top-up. */
  SMS_TOPUP: "DFXS",
} as const;
