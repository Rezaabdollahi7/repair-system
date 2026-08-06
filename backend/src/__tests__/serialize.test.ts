import { serialize } from "../utils/serialize";

// Minimal stand-in for Prisma's Decimal: the serializer detects it by the
// presence of toNumber(), so the real decimal.js class isn't needed here.
class FakeDecimal {
  constructor(private value: number) {}
  toNumber(): number {
    return this.value;
  }
}

describe("serialize", () => {
  it("converts camelCase keys to snake_case", () => {
    expect(serialize({ fullName: "رضا", isActive: true })).toEqual({
      full_name: "رضا",
      is_active: true,
    });
  });

  it("converts Decimal values to plain numbers", () => {
    expect(serialize({ totalAmount: new FakeDecimal(150000) })).toEqual({
      total_amount: 150000,
    });
  });

  it("converts BigInt values to plain numbers", () => {
    expect(serialize({ sizeBytes: 4096n })).toEqual({ size_bytes: 4096 });
  });

  it("converts dates to ISO strings", () => {
    const date = new Date("2026-01-15T10:30:00.000Z");
    expect(serialize({ createdAt: date })).toEqual({
      created_at: "2026-01-15T10:30:00.000Z",
    });
  });

  it("recurses through arrays and nested objects", () => {
    const input = {
      invoiceNumber: "INV-1",
      items: [{ unitPrice: new FakeDecimal(500), itemId: 3 }],
    };

    expect(serialize(input)).toEqual({
      invoice_number: "INV-1",
      items: [{ unit_price: 500, item_id: 3 }],
    });
  });

  it("maps null and undefined to null", () => {
    expect(serialize({ phone: null, avatar: undefined })).toEqual({
      phone: null,
      avatar: null,
    });
  });
});
