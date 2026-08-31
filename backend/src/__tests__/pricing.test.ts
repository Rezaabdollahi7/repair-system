import { Prisma } from "../generated/prisma/client";
import { quotePrice } from "../utils/pricing";

const QUARTERLY = new Prisma.Decimal(19_900_000);
const ANNUAL = new Prisma.Decimal(79_900_000);

function percent(value: number) {
  return { type: "percent" as const, value: new Prisma.Decimal(value) };
}

function fixed(rials: number) {
  return { type: "fixed" as const, value: new Prisma.Decimal(rials) };
}

describe("quotePrice", () => {
  it("charges the plan price when nothing applies", () => {
    const quote = quotePrice({
      planPriceRials: QUARTERLY,
      referralApplies: false,
    });

    expect(quote).toEqual({
      basePriceRials: 19_900_000,
      discountRials: 0,
      amountRials: 19_900_000,
      discountKind: "none",
    });
  });

  it("takes ten percent off for an invited workshop", () => {
    // The figures on the landing page: 1,990,000 tomans becomes 1,791,000.
    const quote = quotePrice({
      planPriceRials: QUARTERLY,
      referralApplies: true,
    });

    expect(quote.amountRials).toBe(17_910_000);
    expect(quote.discountKind).toBe("referral");
  });

  it("applies the same ten percent to the annual plan", () => {
    const quote = quotePrice({ planPriceRials: ANNUAL, referralApplies: true });

    expect(quote.amountRials).toBe(71_910_000);
  });

  it("applies a percentage code", () => {
    const quote = quotePrice({
      planPriceRials: QUARTERLY,
      referralApplies: false,
      discountCode: percent(20),
    });

    expect(quote.discountRials).toBe(3_980_000);
    expect(quote.amountRials).toBe(15_920_000);
    expect(quote.discountKind).toBe("code");
  });

  it("applies a fixed-amount code", () => {
    const quote = quotePrice({
      planPriceRials: QUARTERLY,
      referralApplies: false,
      discountCode: fixed(5_000_000),
    });

    expect(quote.amountRials).toBe(14_900_000);
    expect(quote.discountKind).toBe("code");
  });

  it("takes the larger of the two rather than both", () => {
    // Stacking is how a subscription becomes free through a combination
    // nobody pictured.
    const quote = quotePrice({
      planPriceRials: QUARTERLY,
      referralApplies: true,
      discountCode: percent(30),
    });

    expect(quote.discountRials).toBe(5_970_000);
    expect(quote.discountKind).toBe("code");
  });

  it("keeps the referral when the code is worth less", () => {
    const quote = quotePrice({
      planPriceRials: QUARTERLY,
      referralApplies: true,
      discountCode: percent(5),
    });

    expect(quote.discountRials).toBe(1_990_000);
    expect(quote.discountKind).toBe("referral");
  });

  it("leaves the code unspent when the two are worth the same", () => {
    // Same money either way, so the customer keeps their code for next time.
    const quote = quotePrice({
      planPriceRials: QUARTERLY,
      referralApplies: true,
      discountCode: percent(10),
    });

    expect(quote.discountKind).toBe("referral");
  });

  it("rounds the discount down, never up", () => {
    // 7% of 19,900,000 is 1,393,000 exactly; 3% is 597,000. Neither lands on
    // a ten-thousand boundary by accident, so this is a real test of the
    // rounding rather than of the arithmetic.
    const quote = quotePrice({
      planPriceRials: QUARTERLY,
      referralApplies: false,
      discountCode: percent(7),
    });

    expect(quote.discountRials).toBe(1_390_000);
    expect(quote.amountRials).toBe(18_510_000);
  });

  it("leaves the three numbers adding up", () => {
    // Rounding the total instead of the discount would leave base minus
    // discount disagreeing with what was charged — visible on the receipt,
    // and unexplainable.
    for (const value of [7, 13, 17, 23, 31]) {
      const quote = quotePrice({
        planPriceRials: ANNUAL,
        referralApplies: false,
        discountCode: percent(value),
      });

      expect(quote.basePriceRials - quote.discountRials).toBe(
        quote.amountRials,
      );
    }
  });

  it("never charges less than the gateway accepts", () => {
    // Zibal refuses under 1,000 rials and zero is not a transaction. A code
    // this large was mis-entered; charging the floor makes that visible
    // instead of failing at the gateway with result 105.
    const quote = quotePrice({
      planPriceRials: QUARTERLY,
      referralApplies: false,
      discountCode: fixed(50_000_000),
    });

    expect(quote.amountRials).toBe(10_000);
    expect(quote.discountRials).toBe(19_900_000);
  });

  it("reports no discount as a kind rather than as an absence", () => {
    // "No discount" and "we did not work out whether there was one" must not
    // look the same on a receipt.
    const quote = quotePrice({
      planPriceRials: QUARTERLY,
      referralApplies: false,
      discountCode: fixed(0),
    });

    expect(quote.discountKind).toBe("none");
    expect(quote.discountRials).toBe(0);
  });
});
