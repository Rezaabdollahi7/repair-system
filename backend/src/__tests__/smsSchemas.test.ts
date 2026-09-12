import {
  MAX_TOPUP_RIALS,
  MIN_TOPUP_RIALS,
  topupSchema,
  walletVerifySchema,
} from "../schemas/sms";

describe("topupSchema", () => {
  // The only number a caller can put in a request body that ends up at a
  // payment gateway. Everywhere else the server decides the amount, so these
  // bounds are load-bearing rather than cosmetic.
  it("accepts the floor and the ceiling exactly", () => {
    expect(
      topupSchema.parse({ amount_rials: MIN_TOPUP_RIALS }).amount_rials,
    ).toBe(MIN_TOPUP_RIALS);
    expect(
      topupSchema.parse({ amount_rials: MAX_TOPUP_RIALS }).amount_rials,
    ).toBe(MAX_TOPUP_RIALS);
  });

  it("refuses a rial below the floor and a rial above the ceiling", () => {
    expect(() =>
      topupSchema.parse({ amount_rials: MIN_TOPUP_RIALS - 1 }),
    ).toThrow();
    expect(() =>
      topupSchema.parse({ amount_rials: MAX_TOPUP_RIALS + 1 }),
    ).toThrow();
  });

  it("refuses a fraction of a rial", () => {
    // Either somebody is sending tomans, or a slider produced a float. Both
    // would reach Zibal as an amount nobody typed.
    expect(() => topupSchema.parse({ amount_rials: 200_000.5 })).toThrow();
  });

  it("refuses a number that arrived as a string", () => {
    // Deliberately not coerced, unlike the pagination schema. A body is JSON
    // and can carry a real number; accepting "200000" here would also accept
    // whatever else coercion turns into one.
    expect(() => topupSchema.parse({ amount_rials: "200000" })).toThrow();
  });

  it("quotes the limits in tomans, which is what the shop sees", () => {
    const result = topupSchema.safeParse({ amount_rials: 1_000 });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toContain("20000");
  });
});

describe("walletVerifySchema", () => {
  it("parses a track id past the safe integer range", () => {
    // Zibal's trackId is int64. Read as a number it would round, and the
    // lookup would then miss a row that is right there.
    const big = "9007199254740993";

    expect(walletVerifySchema.parse({ track_id: big }).track_id).toBe(
      BigInt(big),
    );
  });

  it("refuses anything that is not digits", () => {
    expect(() => walletVerifySchema.parse({ track_id: "12a" })).toThrow();
    expect(() => walletVerifySchema.parse({ track_id: "" })).toThrow();
    expect(() => walletVerifySchema.parse({ track_id: 5150 })).toThrow();
  });
});
