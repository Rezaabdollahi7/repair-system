import {
  holdsStock,
  repairInvoiceTransition,
} from "../utils/repairInvoiceStatus";

// Every pair of statuses, because the bugs 14.7 fixes were each one cell of
// this table: issued → draft moving nothing, draft → paid moving nothing.

describe("repairInvoiceTransition", () => {
  it.each([
    ["draft", "issued", "take"],
    ["draft", "paid", "take"],
    ["draft", "cancelled", null],
    ["draft", "draft", null],
    ["issued", "issued", null],
    ["issued", "paid", null],
    ["issued", "cancelled", "return"],
    ["paid", "paid", null],
  ] as const)("allows %s → %s, moving stock: %s", (from, to, stock) => {
    expect(repairInvoiceTransition(from, to)).toEqual({ allowed: true, stock });
  });

  it.each([
    ["issued", "draft"],
    ["paid", "draft"],
    ["paid", "issued"],
    ["paid", "cancelled"],
    ["cancelled", "draft"],
    ["cancelled", "issued"],
    ["cancelled", "paid"],
    ["cancelled", "cancelled"],
  ] as const)("refuses %s → %s", (from, to) => {
    const result = repairInvoiceTransition(from, to);
    expect(result.allowed).toBe(false);
  });

  it("tells the shop how to correct an issued invoice instead", () => {
    const result = repairInvoiceTransition("issued", "draft");
    expect(result).toMatchObject({ allowed: false });
    if (!result.allowed) {
      expect(result.error).toContain("ابطال");
      expect(result.error).toContain("پیش‌فاکتور");
    }
  });

  it("takes stock exactly once, whichever way the invoice leaves draft", () => {
    // draft → issued → paid takes once; draft → paid takes once.
    const viaIssued = [
      repairInvoiceTransition("draft", "issued"),
      repairInvoiceTransition("issued", "paid"),
    ];
    const direct = [repairInvoiceTransition("draft", "paid")];

    const takes = (steps: ReturnType<typeof repairInvoiceTransition>[]) =>
      steps.filter((step) => step.allowed && step.stock === "take").length;

    expect(takes(viaIssued)).toBe(1);
    expect(takes(direct)).toBe(1);
  });
});

describe("holdsStock", () => {
  it.each([
    ["draft", false],
    ["issued", true],
    ["paid", true],
    ["cancelled", false],
  ] as const)("%s holds its parts: %s", (status, holds) => {
    expect(holdsStock(status)).toBe(holds);
  });
});
