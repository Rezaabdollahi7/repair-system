/**
 * What kind of stock movement a ledger row is (14.11).
 *
 * The ledger grew from three types to eleven in 14.1. Every screen that lists
 * movements labels them from here, so a type added later is named once.
 *
 * Colour is the shop's reading rather than an accountant's: stock coming onto
 * the shelf is green and stock leaving it is red — a sale is good for the
 * books and bad for the shelf. Corrections and reversals take the neutral,
 * since they put right what another row said rather than move goods.
 */
export interface MovementType {
  label: string;
  color: string;
  tone: string;
}

const IN = { color: "var(--success)", tone: "bg-success-soft text-success-fg" };
const OUT = { color: "var(--danger)", tone: "bg-danger-soft text-danger-fg" };
const NEUTRAL = {
  color: "var(--text-muted)",
  tone: "bg-surface-alt text-text-secondary",
};

const TYPES: Record<string, MovementType> = {
  opening: { label: "موجودی اولیه", ...IN },
  purchase: { label: "خرید", ...IN },
  sale_return: { label: "مرجوعی فروش", ...IN },
  transfer_in: { label: "انتقال (ورود)", ...IN },
  sale: { label: "فروش", ...OUT },
  repair_use: { label: "مصرف در تعمیر", ...OUT },
  purchase_return: { label: "مرجوعی خرید", ...OUT },
  transfer_out: { label: "انتقال (خروج)", ...OUT },
  adjustment: { label: "اصلاح موجودی", ...NEUTRAL },
  count: { label: "انبارگردانی", ...NEUTRAL },
  reversal: { label: "برگشت سند", ...NEUTRAL },
};

export function movementTypeOf(type: string): MovementType {
  return TYPES[type] ?? { label: "تنظیم", ...NEUTRAL };
}
