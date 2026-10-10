import type { AdjustmentReason } from "../types/api";

/**
 * The reasons a shop can give for correcting the shelf by hand (14.14), and
 * which way each one moves stock — the same rule the server enforces in
 * `schemas/stockAdjustment.ts`, so the form offers only what will be
 * accepted.
 */
export const ADJUSTMENT_REASONS: {
  value: AdjustmentReason;
  label: string;
  direction: "in" | "out" | "either";
}[] = [
  { value: "damage", label: "خرابی", direction: "out" },
  { value: "loss", label: "مفقودی", direction: "out" },
  { value: "internal_use", label: "مصرف داخلی", direction: "out" },
  { value: "found", label: "پیدا شده", direction: "in" },
  { value: "return_from_use", label: "برگشت از مصرف", direction: "in" },
  { value: "entry_error", label: "اصلاح خطای ثبت", direction: "either" },
  { value: "other", label: "سایر", direction: "either" },
];

export function reasonLabel(reason: string): string {
  return ADJUSTMENT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

/** The reasons that fit a direction, in the order the form lists them. */
export function reasonsFor(direction: "in" | "out") {
  return ADJUSTMENT_REASONS.filter(
    (reason) => reason.direction === direction || reason.direction === "either",
  );
}
