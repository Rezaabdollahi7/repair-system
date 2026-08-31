import { Prisma } from "../generated/prisma/client";
import { REFERRAL_DISCOUNT_PERCENT } from "./subscription";

/**
 * Prices are rounded to the nearest ten thousand rials — a thousand tomans,
 * the smallest unit anybody quotes a price in here. Without it, ten percent
 * off 19,900,000 is a figure with digits nobody would write on an invoice.
 */
const ROUNDING_RIALS = 10_000;

/**
 * Zibal refuses anything under 1,000 rials (result code 105), and an amount
 * of zero is not a transaction at all — there would be nothing for the
 * customer to confirm and nothing to verify afterwards. A discount large
 * enough to reach here is a discount that was mis-entered, and charging the
 * floor makes that visible rather than crashing at the gateway.
 */
const MINIMUM_RIALS = 10_000;

/**
 * Which discount was applied, for the receipt and for the payment row.
 *
 * `none` is a real answer rather than null: "no discount" and "we did not
 * work out whether there was one" should not look the same on a receipt.
 */
export type DiscountKind = "none" | "referral" | "code";

export type DiscountCodeInput = {
  type: "percent" | "fixed";
  /** Whole percent for `percent`, rials for `fixed`. */
  value: Prisma.Decimal;
};

export type PriceQuote = {
  basePriceRials: number;
  discountRials: number;
  amountRials: number;
  discountKind: DiscountKind;
};

/** Rounds down, so a rounded price is never more than the one quoted. */
function roundDown(rials: number): number {
  return Math.floor(rials / ROUNDING_RIALS) * ROUNDING_RIALS;
}

function percentOf(base: number, percent: number): number {
  return (base * percent) / 100;
}

/**
 * What a workspace pays for a plan.
 *
 * Pure on purpose: whether the code exists, has expired, has run out of uses
 * or has already been spent by this workspace are database questions and
 * belong to 8.5. By the time anything reaches here, the code is known to be
 * usable — this function only decides what it is worth.
 *
 * ⚠️ The caller must be the server. The client sends a plan and a code, never
 * an amount: a price posted from the browser is a price the customer chose.
 */
export function quotePrice(input: {
  /** From the Plan row, never from the request. */
  planPriceRials: Prisma.Decimal;
  /** True when this workspace was invited and has not bought before. */
  referralApplies: boolean;
  discountCode?: DiscountCodeInput;
}): PriceQuote {
  const basePriceRials = input.planPriceRials.toNumber();

  const referralDiscount = input.referralApplies
    ? percentOf(basePriceRials, REFERRAL_DISCOUNT_PERCENT)
    : 0;

  let codeDiscount = 0;
  if (input.discountCode) {
    const value = input.discountCode.value.toNumber();
    codeDiscount =
      input.discountCode.type === "percent"
        ? percentOf(basePriceRials, value)
        : value;
  }

  // The larger wins; they do not stack. Two fifty-percent codes sitting on
  // top of each other is a free subscription, and the day that happens it
  // will be through a combination nobody pictured.
  //
  // Ties go to the referral: same money either way, and it leaves the
  // customer's code unspent for their next purchase.
  const discountKind: DiscountKind =
    referralDiscount === 0 && codeDiscount === 0
      ? "none"
      : referralDiscount >= codeDiscount
        ? "referral"
        : "code";

  const rawDiscount = Math.max(referralDiscount, codeDiscount);

  // Rounded down, then subtracted — rather than rounding the final amount —
  // so the three numbers on the receipt add up. Rounding the total instead
  // leaves base minus discount disagreeing with what was charged by a few
  // hundred rials, which is the kind of thing a shop owner notices and
  // nobody can explain.
  const cappedDiscount = Math.min(rawDiscount, basePriceRials);
  const discountRials = roundDown(cappedDiscount);

  const amountRials = Math.max(
    basePriceRials - discountRials,
    MINIMUM_RIALS,
  );

  return { basePriceRials, discountRials, amountRials, discountKind };
}
