import { deviceCreateSchema } from "../schemas/device";
import { purchaseInvoiceCreateSchema } from "../schemas/purchaseInvoice";
import { paginationQuerySchema, quantitySchema } from "../schemas/common";
import { itemCreateSchema, quickPurchaseSchema } from "../schemas/item";
import { stockAdjustmentCreateSchema } from "../schemas/stockAdjustment";
import {
  warehouseBodySchema,
  warehouseStatusSchema,
} from "../schemas/warehouse";

describe("optional date fields", () => {
  // Date inputs submit "" when cleared. z.coerce.date() turns that into an
  // Invalid Date, and a null into the epoch — neither is what "no date" means.
  it("treats an empty exit_date as absent", () => {
    const result = deviceCreateSchema.parse({
      device_name: "یخچال",
      exit_date: "",
    });

    expect(result.exit_date ?? null).toBeNull();
  });

  it("still parses a real exit_date", () => {
    const result = deviceCreateSchema.parse({
      device_name: "یخچال",
      exit_date: "2026-01-15",
    });

    expect(result.exit_date).toBeInstanceOf(Date);
    expect(result.exit_date?.getUTCFullYear()).toBe(2026);
  });

  it("never turns an empty invoice_date into the epoch", () => {
    const result = purchaseInvoiceCreateSchema.parse({
      invoice_date: "",
      items: [{ item_id: 1, quantity: 1, unit_price: 1000 }],
    });

    expect(result.invoice_date).toBeUndefined();
  });
});

describe("pagination", () => {
  it("accepts the list size the invoice forms request", () => {
    expect(paginationQuerySchema.parse({ limit: 1000 }).limit).toBe(1000);
  });

  it("still rejects an unbounded page size", () => {
    expect(() => paginationQuerySchema.parse({ limit: 5000 })).toThrow();
  });
});

describe("stock quantities (14.1)", () => {
  const quantity = quantitySchema("مقدار نامعتبر");

  it.each([1, 2.5, 0.125, 1000])("accepts %p", (value) => {
    expect(quantity.safeParse(value).success).toBe(true);
  });

  it.each([0, -1, 1.0005, 0.0000001])("refuses %p", (value) => {
    expect(quantity.safeParse(value).success).toBe(false);
  });
});

describe("an item's opening stock (14.8)", () => {
  const item = { code: "C-1", name: "خازن", unit: "عدد" };

  it("needs no cost when the item opens empty", () => {
    expect(itemCreateSchema.safeParse(item).success).toBe(true);
  });

  it("requires a cost per unit when there is opening stock", () => {
    // Agreed 9 October: opening stock at no cost would value the warehouse,
    // and every margin after it, at nothing.
    const result = itemCreateSchema.safeParse({ ...item, openingStock: 5 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["openingCost"]);
  });

  it("refuses a zero cost too", () => {
    expect(
      itemCreateSchema.safeParse({ ...item, openingStock: 5, openingCost: 0 })
        .success,
    ).toBe(false);
  });

  it("accepts stock with its cost", () => {
    const result = itemCreateSchema.parse({
      ...item,
      openingStock: 2.5,
      openingCost: 1000,
      isFractional: true,
    });
    expect(result).toMatchObject({ openingStock: 2.5, openingCost: 1000 });
  });
});

describe("a quick purchase", () => {
  it("refuses a zero price, which is how free stock used to get in", () => {
    expect(
      quickPurchaseSchema.safeParse({ quantity: 1, unit_price: 0 }).success,
    ).toBe(false);
  });
});

describe("warehouseBodySchema", () => {
  it("trims the name and turns an empty note into null", () => {
    expect(
      warehouseBodySchema.parse({ name: "  تعمیرات ", note: "  " }),
    ).toEqual({ name: "تعمیرات", note: null });
  });

  it("refuses an empty or overlong name", () => {
    expect(warehouseBodySchema.safeParse({ name: "  " }).success).toBe(false);
    expect(
      warehouseBodySchema.safeParse({ name: "ا".repeat(61) }).success,
    ).toBe(false);
  });
});

describe("warehouseStatusSchema", () => {
  it("takes a real boolean only", () => {
    expect(warehouseStatusSchema.safeParse({ is_active: false }).success).toBe(
      true,
    );
    expect(
      warehouseStatusSchema.safeParse({ is_active: "false" }).success,
    ).toBe(false);
  });
});

describe("stockAdjustmentCreateSchema", () => {
  const line = (overrides: Record<string, unknown> = {}) => ({
    item_id: 1,
    direction: "out",
    quantity: 1,
    reason: "damage",
    ...overrides,
  });
  const parse = (lines: unknown[], extra: Record<string, unknown> = {}) =>
    stockAdjustmentCreateSchema.safeParse({ lines, ...extra });
  const messages = (result: ReturnType<typeof parse>) =>
    result.success ? [] : result.error.issues.map((issue) => issue.message);

  it("accepts a plain decrease and defaults the rest", () => {
    const result = parse([line()]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({ description: null });
      expect(result.data.lines[0]).toMatchObject({ note: null });
    }
  });

  it.each([
    ["damage", "in"],
    ["loss", "in"],
    ["internal_use", "in"],
    ["found", "out"],
    ["return_from_use", "out"],
  ])("refuses «%s» moving stock %s", (reason, direction) => {
    const result = parse([line({ reason, direction })]);

    expect(result.success).toBe(false);
    expect(messages(result)[0]).toContain("فقط برای");
  });

  it.each([["entry_error"], ["other"]])("lets «%s» go either way", (reason) => {
    for (const direction of ["in", "out"]) {
      expect(parse([line({ reason, direction, note: "توضیح" })]).success).toBe(
        true,
      );
    }
  });

  it("wants a note for «سایر»", () => {
    expect(messages(parse([line({ reason: "other" })]))).toEqual([
      "برای دلیل «سایر» توضیح الزامی است",
    ]);
    expect(parse([line({ reason: "other", note: "   " })]).success).toBe(false);
  });

  it("refuses the stock count's own reason", () => {
    expect(parse([line({ reason: "count" })]).success).toBe(false);
  });

  it("takes a cost only for stock coming in", () => {
    expect(
      parse([line({ direction: "in", reason: "found", unit_cost: 5000 })])
        .success,
    ).toBe(true);
    expect(parse([line({ unit_cost: 5000 })]).success).toBe(false);
  });

  it("refuses a zero, a negative and a fourth decimal place", () => {
    expect(parse([line({ quantity: 0 })]).success).toBe(false);
    expect(parse([line({ quantity: -2 })]).success).toBe(false);
    expect(parse([line({ quantity: 0.0005 })]).success).toBe(false);
  });

  it("refuses an empty document and one item listed twice", () => {
    expect(parse([]).success).toBe(false);
    expect(messages(parse([line(), line({ quantity: 2 })]))).toEqual([
      "هر کالا فقط یک بار در سند می‌آید",
    ]);
  });
});
