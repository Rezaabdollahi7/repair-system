import {
  averageAfterAdding,
  averageAfterRemoving,
} from "../utils/avgPurchasePrice";

describe("averageAfterAdding", () => {
  it("takes the purchase price when there was no stock", () => {
    expect(
      averageAfterAdding({ avg: 0, stock: 0, quantity: 10, unitPrice: 1000 }),
    ).toBe(1000);
  });

  it("weights the old stock against the new purchase", () => {
    // 5 held at ۱۰۰۰ plus 10 bought at ۲۰۰۰ → ۲۵٬۰۰۰ over 15 units.
    expect(
      averageAfterAdding({
        avg: 1000,
        stock: 5,
        quantity: 10,
        unitPrice: 2000,
      }),
    ).toBeCloseTo(1666.67, 2);
  });

  it("leaves the average where it was when the price has not moved", () => {
    expect(
      averageAfterAdding({
        avg: 1000,
        stock: 5,
        quantity: 10,
        unitPrice: 1000,
      }),
    ).toBe(1000);
  });
});

describe("averageAfterRemoving", () => {
  it("lands back on what the surviving stock cost", () => {
    // The inverse of the weighting above: strip the 10 units bought at
    // ۲۰۰۰ back out and the 5 that remain are worth the ۱۰۰۰ they cost —
    // not the ۱۶۶۶٫۶۷ the blended average said.
    expect(
      averageAfterRemoving({
        avg: 1666.6666666666667,
        stock: 15,
        quantity: 10,
        unitPrice: 2000,
      }),
    ).toBeCloseTo(1000, 6);
  });

  it("round-trips an add", () => {
    const before = { avg: 4200, stock: 7 };
    const after = averageAfterAdding({
      ...before,
      quantity: 12,
      unitPrice: 9100,
    });

    expect(
      averageAfterRemoving({
        avg: after,
        stock: before.stock + 12,
        quantity: 12,
        unitPrice: 9100,
      }),
    ).toBeCloseTo(before.avg, 6);
  });

  it("keeps the old figure when nothing is left to value", () => {
    // At zero stock the valuation is zero whatever the average says, and
    // the number still has to suggest a price on the next purchase form.
    expect(
      averageAfterRemoving({
        avg: 1500,
        stock: 10,
        quantity: 10,
        unitPrice: 1500,
      }),
    ).toBe(1500);
  });

  it("never returns a negative average when the stock was sold on", () => {
    // The reversal cannot see the sales that happened in between, so the
    // value it subtracts can exceed what is left.
    expect(
      averageAfterRemoving({
        avg: 1000,
        stock: 4,
        quantity: 3,
        unitPrice: 9000,
      }),
    ).toBe(0);
  });
});
