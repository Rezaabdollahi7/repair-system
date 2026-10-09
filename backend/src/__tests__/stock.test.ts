import { Prisma } from "../generated/prisma/client";
import {
  FractionalQuantityError,
  InactiveWarehouseError,
  InsufficientStockError,
  InvalidQuantityError,
  planStockMovements,
  stockKey,
  UnknownItemError,
  UnknownWarehouseError,
  type ItemState,
  type StockLine,
  type WarehouseState,
} from "../utils/stock";

// The arithmetic half of the stock service, without a database (RULES §3).
// The locking half is in integration/stock.test.ts, against Postgres.

const MAIN = 1;
const REPAIRS = 2;
const CLOSED = 3;

const d = (value: number) => new Prisma.Decimal(value);

function item(overrides: Partial<ItemState> = {}): ItemState {
  return {
    id: 10,
    name: "خازن",
    isFractional: false,
    stock: d(0),
    avgCost: 0,
    ...overrides,
  };
}

const warehouses = new Map<number, WarehouseState>([
  [MAIN, { id: MAIN, name: "انبار اصلی", isActive: true }],
  [REPAIRS, { id: REPAIRS, name: "تعمیرات", isActive: true }],
  [CLOSED, { id: CLOSED, name: "بسته‌شده", isActive: false }],
]);

/** One item, its stock all in the main warehouse unless told otherwise. */
function plan(
  state: ItemState,
  lines: StockLine[],
  stocks: [number, number][] = [[MAIN, state.stock.toNumber()]],
) {
  return planStockMovements(
    new Map([[state.id, state]]),
    warehouses,
    new Map(
      stocks.map(([warehouseId, quantity]) => [
        stockKey(state.id, warehouseId),
        d(quantity),
      ]),
    ),
    lines,
  );
}

function line(overrides: Partial<StockLine>): StockLine {
  return {
    itemId: 10,
    warehouseId: MAIN,
    quantity: 1,
    type: "purchase",
    ...overrides,
  };
}

describe("planStockMovements — coming in", () => {
  it("takes the purchase price as the average of an empty item", () => {
    const result = plan(item(), [line({ quantity: 10, unitCost: 1000 })]);

    expect(result.items.get(10)).toEqual({ stock: d(10), avgCost: 1000 });
    expect(result.movements[0]).toMatchObject({
      quantity: d(10),
      unitCost: 1000,
      before: d(0),
      after: d(10),
    });
  });

  it("pulls the average towards a new purchase", () => {
    // 20 at 1000 and 10 at 2000: 40000 over 30.
    const result = plan(item({ stock: d(20), avgCost: 1000 }), [
      line({ quantity: 10, unitCost: 2000 }),
    ]);

    expect(result.items.get(10)!.avgCost).toBe(1333.33);
    expect(result.items.get(10)!.stock).toEqual(d(30));
  });

  it("keeps the average when stock comes in with no price of its own", () => {
    // A found unit, a transfer in: valued at what the rest already cost.
    const result = plan(item({ stock: d(4), avgCost: 2500 }), [
      line({ quantity: 1, type: "adjustment", reason: "found" }),
    ]);

    expect(result.items.get(10)!.avgCost).toBe(2500);
    expect(result.movements[0].unitCost).toBe(2500);
    expect(result.movements[0].reason).toBe("found");
  });

  it("values an opening balance at its own cost, not at zero", () => {
    // The bug 14.8 removes: opening stock used to be a 0-rial purchase,
    // which dragged every later average down.
    const opening = plan(item(), [
      line({ quantity: 10, type: "opening", unitCost: 1000 }),
    ]);
    expect(opening.items.get(10)!.avgCost).toBe(1000);
  });
});

describe("planStockMovements — going out", () => {
  it("leaves at the moving average and leaves the average alone", () => {
    const result = plan(item({ stock: d(10), avgCost: 1500 }), [
      line({ quantity: -4, type: "sale", unitPrice: 2200 }),
    ]);

    expect(result.items.get(10)).toEqual({ stock: d(6), avgCost: 1500 });
    expect(result.movements[0]).toMatchObject({
      unitCost: 1500,
      unitPrice: 2200,
      before: d(10),
      after: d(6),
    });
  });

  it("refuses to take more than the warehouse holds, naming the item", () => {
    expect(() =>
      plan(item({ stock: d(3) }), [line({ quantity: -5, type: "sale" })]),
    ).toThrow(InsufficientStockError);

    try {
      plan(item({ stock: d(3) }), [line({ quantity: -5, type: "sale" })]);
    } catch (error) {
      expect(error).toMatchObject({
        itemName: "خازن",
        available: 3,
        requested: 5,
      });
      expect((error as Error).message).toContain("خازن");
    }
  });

  it("lets the last unit go, down to exactly zero", () => {
    const result = plan(item({ stock: d(1) }), [
      line({ quantity: -1, type: "sale" }),
    ]);
    expect(result.stocks.get(stockKey(10, MAIN))).toEqual(d(0));
  });

  it("judges per warehouse, not by the item's total", () => {
    // Twelve in all, but only two in the repairs warehouse.
    expect(() =>
      plan(
        item({ stock: d(12) }),
        [line({ quantity: -3, type: "repair_use", warehouseId: REPAIRS })],
        [
          [MAIN, 10],
          [REPAIRS, 2],
        ],
      ),
    ).toThrow(InsufficientStockError);
  });

  it("takes a purchase back out at the price it came in at", () => {
    // 5 at 1000 plus 10 at 2000 averages 1666.67. Removing the ten at that
    // average would value the surviving five at 1666.67; at their own price
    // it lands back on the 1000 they cost.
    const result = plan(item({ stock: d(15), avgCost: 1666.67 }), [
      line({ quantity: -10, type: "reversal", unitCost: 2000 }),
    ]);

    // Within a hundredth of a rial: the average is stored as Decimal(18,2),
    // so the 1666.666… it really was is held as 1666.67, and the hundredth
    // that rounding added comes back out with the reversal.
    expect(result.items.get(10)!.avgCost).toBeCloseTo(1000, 1);
    expect(result.movements[0].unitCost).toBe(2000);
  });
});

describe("planStockMovements — several lines", () => {
  it("applies them in order, each seeing what the last one left", () => {
    // An invoice edit: the old line out, the new one in.
    const result = plan(item({ stock: d(10), avgCost: 1000 }), [
      line({ quantity: -10, type: "reversal", unitCost: 1000 }),
      line({ quantity: 12, type: "purchase", unitCost: 1100 }),
    ]);

    expect(result.movements.map((m) => [m.before, m.after])).toEqual([
      [d(10), d(0)],
      [d(0), d(12)],
    ]);
    expect(result.items.get(10)).toEqual({ stock: d(12), avgCost: 1100 });
  });

  it("refuses the whole document when one line cannot be applied", () => {
    expect(() =>
      plan(item({ stock: d(2) }), [
        line({ quantity: -1, type: "sale" }),
        line({ quantity: -2, type: "sale" }),
      ]),
    ).toThrow(InsufficientStockError);
  });

  it("moves a transfer without changing the item's total or average", () => {
    const result = plan(
      item({ stock: d(10), avgCost: 800 }),
      [
        line({ quantity: -4, type: "transfer_out", warehouseId: MAIN }),
        line({ quantity: 4, type: "transfer_in", warehouseId: REPAIRS }),
      ],
      [[MAIN, 10]],
    );

    expect(result.items.get(10)).toEqual({ stock: d(10), avgCost: 800 });
    expect(result.stocks.get(stockKey(10, MAIN))).toEqual(d(6));
    expect(result.stocks.get(stockKey(10, REPAIRS))).toEqual(d(4));
    expect(result.movements.map((m) => m.unitCost)).toEqual([800, 800]);
  });

  it("reports only the items and warehouses it touched", () => {
    const other = item({ id: 11, name: "مقاومت", stock: d(5) });
    const result = planStockMovements(
      new Map([
        [10, item({ stock: d(1) })],
        [11, other],
      ]),
      warehouses,
      new Map([
        [stockKey(10, MAIN), d(1)],
        [stockKey(11, MAIN), d(5)],
      ]),
      [line({ quantity: 2, unitCost: 100 })],
    );

    expect([...result.items.keys()]).toEqual([10]);
    expect([...result.stocks.keys()]).toEqual([stockKey(10, MAIN)]);
  });
});

describe("planStockMovements — quantities", () => {
  it("keeps whole-number items whole", () => {
    expect(() => plan(item(), [line({ quantity: 0.5, unitCost: 1 })])).toThrow(
      FractionalQuantityError,
    );
  });

  it("lets a fractional item move by fractions, exactly", () => {
    // 0.1 + 0.2 is not 0.3 in floating point; in Decimal it is.
    const cable = item({ isFractional: true, stock: d(0.3) });
    const result = plan(cable, [
      line({ quantity: -0.1, type: "sale" }),
      line({ quantity: -0.2, type: "sale" }),
    ]);

    expect(result.stocks.get(stockKey(10, MAIN))!.isZero()).toBe(true);
  });

  it.each([0, 1.0005, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses a quantity of %p",
    (quantity) => {
      expect(() =>
        plan(item({ isFractional: true }), [line({ quantity, unitCost: 1 })]),
      ).toThrow(InvalidQuantityError);
    },
  );
});

describe("planStockMovements — warehouses and items", () => {
  it("refuses new stock into a deactivated warehouse", () => {
    expect(() =>
      plan(item(), [line({ quantity: 1, unitCost: 1, warehouseId: CLOSED })]),
    ).toThrow(InactiveWarehouseError);
  });

  it("lets an old document take its own movement back from one", () => {
    // A sale from before the warehouse closed, now deleted: its units return
    // where they left from.
    const result = plan(
      item(),
      [line({ quantity: 2, type: "reversal", warehouseId: CLOSED })],
      [],
    );
    expect(result.stocks.get(stockKey(10, CLOSED))).toEqual(d(2));
  });

  it("refuses an item it was not given", () => {
    expect(() => plan(item(), [line({ itemId: 99 })])).toThrow(
      UnknownItemError,
    );
  });

  it("refuses a warehouse it was not given", () => {
    expect(() => plan(item(), [line({ warehouseId: 99 })])).toThrow(
      UnknownWarehouseError,
    );
  });
});
