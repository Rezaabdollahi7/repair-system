import { deviceCreateSchema } from "../schemas/device";
import { purchaseInvoiceCreateSchema } from "../schemas/purchaseInvoice";
import { paginationQuerySchema } from "../schemas/common";

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
