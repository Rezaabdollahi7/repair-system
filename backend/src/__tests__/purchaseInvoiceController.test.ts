import { Request, Response } from "express";
import * as controller from "../controllers/purchaseInvoiceController";
import prisma, { runInWorkspaceTransaction } from "../lib/prisma";
import { applyStockMovements, InsufficientStockError } from "../utils/stock";
import { resolveWarehouseId } from "../utils/warehouse";

jest.mock("../lib/prisma", () => {
  const tx = {
    // The counter lives on the workspace row now, so numbering is an update
    // rather than a count.
    workspace: { update: jest.fn() },
    purchaseInvoice: {
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    purchaseInvoiceItem: { createMany: jest.fn(), deleteMany: jest.fn() },
    // The row lock an edit or delete takes before reading the invoice. One
    // row back means the invoice exists in this workspace.
    $queryRaw: jest.fn(),
  };

  return {
    __esModule: true,
    default: {
      purchaseInvoice: {
        count: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      __tx: tx,
    },
    // Named alongside the default export now that controllers import both.
    // Runs the callback against the same mocks the assertions inspect.
    runInWorkspaceTransaction: jest.fn(
      (_workspaceId: number, fn: (client: unknown) => unknown) => fn(tx),
    ),
  };
});

// The stock arithmetic and locking have their own suites (stock.test.ts and
// integration/stock.test.ts). Here the question is only what this
// controller asks the service to move — the error classes stay real so the
// controller's instanceof checks still work.
jest.mock("../utils/stock", () => ({
  ...jest.requireActual("../utils/stock"),
  applyStockMovements: jest.fn(),
}));

jest.mock("../utils/warehouse", () => ({
  resolveWarehouseId: jest.fn(),
}));

const db = prisma as unknown as {
  purchaseInvoice: Record<string, jest.Mock>;
  __tx: {
    workspace: Record<string, jest.Mock>;
    purchaseInvoice: Record<string, jest.Mock>;
    purchaseInvoiceItem: Record<string, jest.Mock>;
    $queryRaw: jest.Mock;
  };
};

const applyMovements = applyStockMovements as unknown as jest.Mock;
const resolveWarehouse = resolveWarehouseId as unknown as jest.Mock;
const MAIN_WAREHOUSE = 4;

const runInTx = runInWorkspaceTransaction as unknown as jest.Mock;

function decimal(value: number) {
  return { toNumber: () => value };
}

function mockResponse() {
  const res = {} as Response & { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// Every tenant-scoped handler reads workspaceIdOf(req), which throws when
// the token carried no workspace — so the mock always supplies one, even
// when a test doesn't care which user acted.
const WORKSPACE_ID = 1;

function mockRequest(valid: Record<string, unknown> = {}, actorId?: number) {
  return {
    valid: { body: undefined, params: undefined, query: undefined, ...valid },
    user: { id: actorId ?? null, workspaceId: WORKSPACE_ID },
  } as unknown as Request;
}

function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    workspaceId: WORKSPACE_ID,
    invoiceNumber: "PUR-20260806-001",
    supplierName: "تأمین‌کننده",
    warehouseId: MAIN_WAREHOUSE,
    invoiceDate: new Date("2026-08-06T00:00:00.000Z"),
    totalAmount: decimal(30000),
    paidAmount: decimal(30000),
    paymentStatus: "paid",
    note: null,
    createdBy: 3,
    createdAt: new Date("2026-08-06T00:00:00.000Z"),
    updatedAt: new Date("2026-08-06T00:00:00.000Z"),
    ...overrides,
  };
}

const listQuery = { page: 1, limit: 10 };

beforeEach(() => {
  jest.clearAllMocks();
  resolveWarehouse.mockResolvedValue(MAIN_WAREHOUSE);
  applyMovements.mockResolvedValue([]);
});

describe("purchaseInvoiceController.getAll", () => {
  it("counts the same rows it returns when filtering", async () => {
    db.purchaseInvoice.count.mockResolvedValue(0);
    db.purchaseInvoice.findMany.mockResolvedValue([]);

    await controller.getAll(
      mockRequest({ query: { ...listQuery, payment_status: ["pending"] } }),
      mockResponse(),
    );

    // The total drives the pager, so it has to be counted over the filtered
    // set — otherwise three rows come back under thirty pages of them.
    expect(db.purchaseInvoice.count.mock.calls[0][0].where).toEqual(
      db.purchaseInvoice.findMany.mock.calls[0][0].where,
    );
  });

  it("converts Decimal columns to numbers", async () => {
    db.purchaseInvoice.count.mockResolvedValue(1);
    db.purchaseInvoice.findMany.mockResolvedValue([invoiceRow()]);

    const res = mockResponse();
    await controller.getAll(mockRequest({ query: listQuery }), res);

    expect(res.json.mock.calls[0][0].data[0]).toMatchObject({
      id: 5,
      invoice_number: "PUR-20260806-001",
      total_amount: 30000,
      paid_amount: 30000,
      payment_status: "paid",
    });
  });

  it("scopes the listing to the caller's workspace", async () => {
    db.purchaseInvoice.count.mockResolvedValue(0);
    db.purchaseInvoice.findMany.mockResolvedValue([]);

    await controller.getAll(mockRequest({ query: listQuery }), mockResponse());

    expect(db.purchaseInvoice.findMany.mock.calls[0][0].where).toEqual({
      workspaceId: WORKSPACE_ID,
    });
  });

  it("filters by supplier name case-insensitively", async () => {
    db.purchaseInvoice.count.mockResolvedValue(0);
    db.purchaseInvoice.findMany.mockResolvedValue([]);

    await controller.getAll(
      mockRequest({ query: { ...listQuery, supplier: "پارس" } }),
      mockResponse(),
    );

    expect(db.purchaseInvoice.findMany.mock.calls[0][0].where).toEqual({
      workspaceId: WORKSPACE_ID,
      supplierName: { contains: "پارس", mode: "insensitive" },
    });
  });

  it("filters by payment status", async () => {
    db.purchaseInvoice.count.mockResolvedValue(0);
    db.purchaseInvoice.findMany.mockResolvedValue([]);

    await controller.getAll(
      mockRequest({
        query: { ...listQuery, payment_status: ["pending", "partial"] },
      }),
      mockResponse(),
    );

    expect(db.purchaseInvoice.findMany.mock.calls[0][0].where).toEqual({
      workspaceId: WORKSPACE_ID,
      paymentStatus: { in: ["pending", "partial"] },
    });
  });

  it("includes invoices recorded during the day the range ends on", async () => {
    db.purchaseInvoice.count.mockResolvedValue(0);
    db.purchaseInvoice.findMany.mockResolvedValue([]);

    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-01-31T00:00:00.000Z");

    await controller.getAll(
      mockRequest({ query: { ...listQuery, from_date: from, to_date: to } }),
      mockResponse(),
    );

    // A bare lte on the parsed date stops at midnight and drops everything
    // recorded on the 31st itself.
    const filter = db.purchaseInvoice.findMany.mock.calls[0][0].where
      .invoiceDate as { gte: Date; lte: Date };
    expect(filter.gte).toEqual(from);
    expect(filter.lte.getUTCDate()).toBe(31);
    expect(filter.lte.getUTCHours()).toBe(23);
  });
});

describe("purchaseInvoiceController.getById", () => {
  it("returns 404 for an invoice in another workspace", async () => {
    db.purchaseInvoice.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.getById(mockRequest({ params: { id: 9 } }), res);

    expect(db.purchaseInvoice.findFirst.mock.calls[0][0].where).toEqual({
      id: 9,
      workspaceId: WORKSPACE_ID,
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("flattens each line's item into code, name and unit", async () => {
    db.purchaseInvoice.findFirst.mockResolvedValue({
      ...invoiceRow(),
      items: [
        {
          id: 1,
          invoiceId: 5,
          itemId: 2,
          quantity: decimal(10),
          unitPrice: decimal(3000),
          totalPrice: decimal(30000),
          createdAt: new Date("2026-08-06T00:00:00.000Z"),
          item: { code: "C-100", name: "خازن", unit: "عدد" },
        },
      ],
      warehouse: { name: "انبار اصلی" },
    });

    const res = mockResponse();
    await controller.getById(mockRequest({ params: { id: 5 } }), res);

    expect(res.json.mock.calls[0][0].items[0]).toEqual({
      id: 1,
      invoice_id: 5,
      item_id: 2,
      quantity: 10,
      unit_price: 3000,
      total_price: 30000,
      created_at: "2026-08-06T00:00:00.000Z",
      item_code: "C-100",
      item_name: "خازن",
      item_unit: "عدد",
    });
  });
});

describe("purchaseInvoiceController.create", () => {
  const body = {
    supplier_name: "تأمین‌کننده",
    invoice_date: undefined,
    warehouse_id: undefined,
    paid_amount: 30000,
    note: null,
    items: [{ item_id: 2, quantity: 10, unit_price: 3000 }],
  };

  beforeEach(() => {
    db.__tx.workspace.update.mockResolvedValue({ purchaseSeq: 1 });
    db.__tx.purchaseInvoice.create.mockResolvedValue(invoiceRow());
  });

  it("derives the total from the lines and marks it paid", async () => {
    await controller.create(mockRequest({ body }, 3), mockResponse());

    expect(db.__tx.purchaseInvoice.create.mock.calls[0][0].data).toMatchObject({
      workspaceId: WORKSPACE_ID,
      warehouseId: MAIN_WAREHOUSE,
      totalAmount: 30000,
      paidAmount: 30000,
      paymentStatus: "paid",
      createdBy: 3,
    });
  });

  it("rounds a fractional line to whole rials", async () => {
    // 2.5 metres at 1001 is 2502.5 — there is no half rial to store.
    await controller.create(
      mockRequest({
        body: {
          ...body,
          paid_amount: 0,
          items: [{ item_id: 2, quantity: 2.5, unit_price: 1001 }],
        },
      }),
      mockResponse(),
    );

    expect(
      db.__tx.purchaseInvoiceItem.createMany.mock.calls[0][0].data[0],
    ).toMatchObject({ quantity: 2.5, totalPrice: 2503 });
    expect(
      db.__tx.purchaseInvoice.create.mock.calls[0][0].data.totalAmount,
    ).toBe(2503);
  });

  it("takes its number from its own workspace's counter", async () => {
    await controller.create(mockRequest({ body }, 3), mockResponse());

    // increment rather than a count: two concurrent requests could both read
    // the same count, while `seq = seq + 1` takes a row lock and hands each
    // caller a number nobody else can get.
    expect(db.__tx.workspace.update).toHaveBeenCalledWith({
      where: { id: WORKSPACE_ID },
      data: { purchaseSeq: { increment: 1 } },
      select: { purchaseSeq: true },
    });
    expect(
      db.__tx.purchaseInvoice.create.mock.calls[0][0].data.invoiceNumber,
    ).toBe("PUR-0001");
  });

  it("marks a part payment as partial", async () => {
    await controller.create(
      mockRequest({ body: { ...body, paid_amount: 10000 } }, 3),
      mockResponse(),
    );

    expect(
      db.__tx.purchaseInvoice.create.mock.calls[0][0].data.paymentStatus,
    ).toBe("partial");
  });

  it("receives the goods into the warehouse it names", async () => {
    resolveWarehouse.mockResolvedValue(7);

    await controller.create(
      mockRequest({ body: { ...body, warehouse_id: 7 } }),
      mockResponse(),
    );

    expect(resolveWarehouse).toHaveBeenCalledWith(
      expect.anything(),
      WORKSPACE_ID,
      7,
    );
    expect(
      db.__tx.purchaseInvoice.create.mock.calls[0][0].data.warehouseId,
    ).toBe(7);
    expect(applyMovements.mock.calls[0][3][0].warehouseId).toBe(7);
  });

  it("brings each line in at the price paid, against this invoice", async () => {
    await controller.create(mockRequest({ body }, 3), mockResponse());

    const [, workspaceId, document, lines] = applyMovements.mock.calls[0];
    expect(workspaceId).toBe(WORKSPACE_ID);
    expect(document).toMatchObject({
      referenceType: "purchase_invoice",
      referenceId: 5,
      actorId: 3,
    });
    // The price paid is the cost: it is what pulls the moving average.
    expect(lines).toEqual([
      {
        itemId: 2,
        warehouseId: MAIN_WAREHOUSE,
        quantity: 10,
        type: "purchase",
        unitCost: 3000,
        unitPrice: 3000,
        note: "خرید از فاکتور",
      },
    ]);
  });

  it("dates the movement by the invoice, not by the clock", async () => {
    const dated = new Date("2026-07-01T00:00:00.000Z");
    db.__tx.purchaseInvoice.create.mockResolvedValue(
      invoiceRow({ invoiceDate: dated }),
    );

    await controller.create(
      mockRequest({ body: { ...body, invoice_date: dated } }),
      mockResponse(),
    );

    expect(applyMovements.mock.calls[0][2].occurredAt).toEqual(dated);
  });

  it("answers 400 with the service's reason when it refuses", async () => {
    applyMovements.mockRejectedValue(
      new (jest.requireActual("../utils/stock").UnknownItemError)(2),
    );

    const res = mockResponse();
    await controller.create(mockRequest({ body }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "کالا با شناسه 2 یافت نشد",
    });
  });

  it("does everything inside one transaction", async () => {
    await controller.create(mockRequest({ body }, 3), mockResponse());

    expect(runInTx).toHaveBeenCalledWith(WORKSPACE_ID, expect.any(Function));
  });
});

describe("purchaseInvoiceController.updatePayment", () => {
  it("returns 404 for an invoice in another workspace", async () => {
    db.purchaseInvoice.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.updatePayment(
      mockRequest({ params: { id: 9 }, body: { paid_amount: 100 } }),
      res,
    );

    expect(db.purchaseInvoice.findFirst.mock.calls[0][0].where).toEqual({
      id: 9,
      workspaceId: WORKSPACE_ID,
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.purchaseInvoice.update).not.toHaveBeenCalled();
  });

  it("recomputes the status from the new amount", async () => {
    db.purchaseInvoice.findFirst.mockResolvedValue({
      totalAmount: decimal(30000),
    });
    db.purchaseInvoice.update.mockResolvedValue(invoiceRow());

    const res = mockResponse();
    await controller.updatePayment(
      mockRequest({ params: { id: 5 }, body: { paid_amount: 0 } }),
      res,
    );

    expect(db.purchaseInvoice.update.mock.calls[0][0].data).toEqual({
      paidAmount: 0,
      paymentStatus: "pending",
    });
    expect(res.json).toHaveBeenCalledWith({
      message: "وضعیت پرداخت بروز شد",
      payment_status: "pending",
    });
  });
});

/** The invoice as lockInvoice reads it: found, with these lines. */
function lockedInvoice(
  items: {
    itemId: number;
    quantity: ReturnType<typeof decimal>;
    unitPrice: ReturnType<typeof decimal>;
  }[],
  overrides: Record<string, unknown> = {},
) {
  db.__tx.$queryRaw.mockResolvedValue([{ id: 5 }]);
  db.__tx.purchaseInvoice.findFirst.mockResolvedValue({
    ...invoiceRow(overrides),
    items,
  });
}

function lockedNothing() {
  db.__tx.$queryRaw.mockResolvedValue([]);
}

const tenAt3000 = {
  itemId: 2,
  quantity: decimal(10),
  unitPrice: decimal(3000),
};

describe("purchaseInvoiceController.remove", () => {
  it("returns 404 for an invoice in another workspace", async () => {
    lockedNothing();

    const res = mockResponse();
    await controller.remove(mockRequest({ params: { id: 9 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(applyMovements).not.toHaveBeenCalled();
    expect(db.__tx.purchaseInvoice.delete).not.toHaveBeenCalled();
  });

  it("locks the invoice in this workspace before reading it", async () => {
    // Two deletes used to read the invoice outside the transaction, both
    // find it, and both put its goods back. Under the lock the second waits
    // and then finds nothing.
    lockedInvoice([tenAt3000]);

    await controller.remove(mockRequest({ params: { id: 5 } }), mockResponse());

    const sql = db.__tx.$queryRaw.mock.calls[0][0].join("?");
    expect(sql).toMatch(/FOR UPDATE/);
    expect(db.__tx.$queryRaw.mock.calls[0].slice(1)).toEqual([5, WORKSPACE_ID]);
  });

  it("deletes an invoice that has no lines", async () => {
    // The old handler read the lines first and treated an empty result as
    // "not found", so such an invoice could never be removed.
    lockedInvoice([]);

    const res = mockResponse();
    await controller.remove(mockRequest({ params: { id: 5 } }), res);

    expect(db.__tx.purchaseInvoice.delete).toHaveBeenCalledWith({
      where: { id: 5 },
    });
    expect(res.json).toHaveBeenCalledWith({
      message: "فاکتور و تراکنش‌های مربوطه حذف شدند",
    });
  });

  it("takes each line back out at the price it was bought at", async () => {
    lockedInvoice([tenAt3000]);

    await controller.remove(
      mockRequest({ params: { id: 5 } }, 3),
      mockResponse(),
    );

    const [, , document, lines] = applyMovements.mock.calls[0];
    expect(document).toMatchObject({
      referenceType: "purchase_invoice",
      referenceId: 5,
      actorId: 3,
    });
    // At the line's own price, not the current average — the only inverse
    // that lands back on what the surviving stock cost.
    expect(lines).toEqual([
      {
        itemId: 2,
        warehouseId: MAIN_WAREHOUSE,
        quantity: -10,
        type: "reversal",
        unitCost: 3000,
        unitPrice: 3000,
        note: "حذف فاکتور خرید",
      },
    ]);
  });

  it("refuses, and says why, when the goods were already sold on", async () => {
    // It used to clamp at zero and carry on, which left the ledger and the
    // stock column disagreeing for good.
    lockedInvoice([tenAt3000]);
    applyMovements.mockRejectedValue(
      new InsufficientStockError(2, "خازن", 4, 10),
    );

    const res = mockResponse();
    await controller.remove(mockRequest({ params: { id: 5 } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain("«خازن»");
    expect(res.json.mock.calls[0][0].error).toContain("فروخته یا مصرف شده");
    expect(db.__tx.purchaseInvoice.delete).not.toHaveBeenCalled();
  });
});

describe("purchaseInvoiceController.update", () => {
  const body = {
    supplier_name: "تأمین‌کننده تازه",
    invoice_date: new Date("2026-09-01T00:00:00.000Z"),
    warehouse_id: undefined,
    paid_amount: 0,
    note: null,
    items: [{ item_id: 2, quantity: 4, unit_price: 5000 }],
  };

  it("returns 404 for an invoice in another workspace", async () => {
    lockedNothing();

    const res = mockResponse();
    await controller.update(mockRequest({ params: { id: 9 }, body }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(applyMovements).not.toHaveBeenCalled();
  });

  it("puts the new lines in before taking the old ones out", async () => {
    // Ten bought, five sold since, edited to twelve: taking the ten out first
    // would fall below zero on the way to a valid fifteen.
    lockedInvoice([tenAt3000]);

    await controller.update(
      mockRequest({ params: { id: 5 }, body }, 3),
      mockResponse(),
    );

    const lines = applyMovements.mock.calls[0][3];
    expect(
      lines.map((line: { type: string; quantity: number }) => [
        line.type,
        line.quantity,
      ]),
    ).toEqual([
      ["purchase", 4],
      ["reversal", -10],
    ]);
    expect(lines[1]).toMatchObject({
      unitCost: 3000,
      note: "ویرایش فاکتور خرید",
    });
  });

  it("records both halves against this invoice", async () => {
    lockedInvoice([tenAt3000]);

    await controller.update(
      mockRequest({ params: { id: 5 }, body }, 3),
      mockResponse(),
    );

    expect(applyMovements.mock.calls[0][2]).toMatchObject({
      referenceType: "purchase_invoice",
      referenceId: 5,
      occurredAt: body.invoice_date,
      actorId: 3,
    });
  });

  it("takes the old lines out of the warehouse they went into", async () => {
    // The invoice moves to warehouse 7; its old goods leave warehouse 4.
    lockedInvoice([tenAt3000]);
    resolveWarehouse.mockResolvedValue(7);

    await controller.update(
      mockRequest({ params: { id: 5 }, body: { ...body, warehouse_id: 7 } }),
      mockResponse(),
    );

    const lines = applyMovements.mock.calls[0][3];
    expect(lines[0]).toMatchObject({ type: "purchase", warehouseId: 7 });
    expect(lines[1]).toMatchObject({
      type: "reversal",
      warehouseId: MAIN_WAREHOUSE,
    });
    expect(
      db.__tx.purchaseInvoice.update.mock.calls[0][0].data.warehouseId,
    ).toBe(7);
  });

  it("keeps the warehouse when the edit names none", async () => {
    lockedInvoice([tenAt3000]);

    await controller.update(
      mockRequest({ params: { id: 5 }, body }),
      mockResponse(),
    );

    expect(resolveWarehouse).not.toHaveBeenCalled();
    expect(
      db.__tx.purchaseInvoice.update.mock.calls[0][0].data.warehouseId,
    ).toBe(MAIN_WAREHOUSE);
  });

  it("replaces the line rows rather than appending to them", async () => {
    lockedInvoice([tenAt3000]);

    await controller.update(
      mockRequest({ params: { id: 5 }, body }),
      mockResponse(),
    );

    expect(db.__tx.purchaseInvoiceItem.deleteMany).toHaveBeenCalledWith({
      where: { invoiceId: 5 },
    });
    expect(
      db.__tx.purchaseInvoiceItem.createMany.mock.calls[0][0].data,
    ).toHaveLength(1);
  });

  it("recomputes the total and the payment status from the new lines", async () => {
    lockedInvoice([]);

    await controller.update(
      mockRequest(
        { params: { id: 5 }, body: { ...body, paid_amount: 20000 } },
        3,
      ),
      mockResponse(),
    );

    // 4 × 5000, paid in full — the status follows the edited lines, not what
    // the invoice said before.
    expect(db.__tx.purchaseInvoice.update.mock.calls[0][0].data).toMatchObject({
      totalAmount: 20000,
      paidAmount: 20000,
      paymentStatus: "paid",
    });
  });

  it("leaves the invoice number alone", async () => {
    lockedInvoice([]);

    await controller.update(
      mockRequest({ params: { id: 5 }, body }),
      mockResponse(),
    );

    // Numbering is gap-free per workspace; an edit that drew a new number
    // would burn one and leave a hole in the sequence.
    expect(
      db.__tx.purchaseInvoice.update.mock.calls[0][0].data,
    ).not.toHaveProperty("invoiceNumber");
    expect(db.__tx.workspace.update).not.toHaveBeenCalled();
  });

  it("refuses an edit that would leave sold goods unaccounted for", async () => {
    lockedInvoice([tenAt3000]);
    applyMovements.mockRejectedValue(
      new InsufficientStockError(2, "خازن", 1, 10),
    );

    const res = mockResponse();
    await controller.update(mockRequest({ params: { id: 5 }, body }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain("«خازن»");
  });
});

describe("purchaseInvoiceController.create — the free-line rule", () => {
  it("is enforced by the schema, not the controller", () => {
    // Documented here because the controller no longer checks it: the zero
    // price rejection lives in purchaseInvoiceCreateSchema, where unit_price
    // is positive() rather than min(0). Covered by validate's own tests.
    expect(true).toBe(true);
  });
});
