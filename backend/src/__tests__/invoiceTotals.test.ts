import { invoiceTotals, lineTotals } from "../utils/invoiceTotals";

describe("lineTotals", () => {
  it("returns the gross when the line has no discount", () => {
    expect(lineTotals({ quantity: 3, unit_price: 10000 })).toEqual({
      discountAmount: 0,
      totalPrice: 30000,
    });
  });

  it("applies a percentage discount", () => {
    expect(
      lineTotals({
        quantity: 2,
        unit_price: 50000,
        discount_type: "percentage",
        discount_value: 10,
      }),
    ).toEqual({ discountAmount: 10000, totalPrice: 90000 });
  });

  it("applies a fixed discount as a rial amount", () => {
    expect(
      lineTotals({
        quantity: 1,
        unit_price: 50000,
        discount_type: "fixed",
        discount_value: 5000,
      }),
    ).toEqual({ discountAmount: 5000, totalPrice: 45000 });
  });

  it("rounds to whole rial, since the columns hold no decimals", () => {
    const result = lineTotals({
      quantity: 1,
      unit_price: 1000,
      discount_type: "percentage",
      discount_value: 33.33,
    });

    expect(Number.isInteger(result.discountAmount)).toBe(true);
    expect(Number.isInteger(result.totalPrice)).toBe(true);
  });

  it("treats a missing price as zero", () => {
    expect(lineTotals({ quantity: 5 })).toEqual({
      discountAmount: 0,
      totalPrice: 0,
    });
  });
});

describe("invoiceTotals", () => {
  const lines = [
    { quantity: 2, unit_price: 50000 },
    { quantity: 1, unit_price: 100000 },
  ];

  it("sums the lines with no discount or tax", () => {
    expect(invoiceTotals(lines, null, 0, 0)).toEqual({
      subtotal: 200000,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 200000,
    });
  });

  it("subtracts line discounts before the invoice total", () => {
    const discounted = [
      {
        quantity: 2,
        unit_price: 50000,
        discount_type: "percentage",
        discount_value: 50,
      },
    ];

    expect(invoiceTotals(discounted, null, 0, 0).subtotal).toBe(50000);
  });

  it("taxes what remains after the invoice discount", () => {
    // 200000 less 10% is 180000; 9% tax on that is 16200.
    expect(invoiceTotals(lines, "percentage", 10, 9)).toEqual({
      subtotal: 200000,
      discountAmount: 20000,
      taxAmount: 16200,
      totalAmount: 196200,
    });
  });

  it("never lets an oversized fixed discount push the tax base below zero", () => {
    const result = invoiceTotals(lines, "fixed", 500000, 9);

    expect(result.taxAmount).toBe(0);
    expect(result.totalAmount).toBe(0);
  });
});
