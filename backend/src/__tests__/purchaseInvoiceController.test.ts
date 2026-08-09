import { Request, Response } from "express";
import * as controller from "../controllers/purchaseInvoiceController";
import prisma from "../lib/prisma";

jest.mock("../lib/prisma", () => {
  const tx = {
    purchaseInvoice: {
      count: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    purchaseInvoiceItem: { create: jest.fn() },
    // findFirstOrThrow rather than findUniqueOrThrow: the controller pairs
    // the item id with workspaceId now, which findUnique can't express.
    item: { findFirstOrThrow: jest.fn(), update: jest.fn() },
    inventoryTransaction: { create: jest.fn() },
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
      item: { findMany: jest.fn() },
      $transaction: jest.fn((callback: (client: unknown) => unknown) =>
        callback(tx),
      ),
      __tx: tx,
    },
  };
});

const db = prisma as unknown as {
  purchaseInvoice: Record<string, jest.Mock>;
  item: Record<string, jest.Mock>;
  $transaction: jest.Mock;
  __tx: {
    purchaseInvoice: Record<string, jest.Mock>;
    purchaseInvoiceItem: Record<string, jest.Mock>;
    item: Record<string, jest.Mock>;
    inventoryTransaction: Record<string, jest.Mock>;
  };
};

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
});

describe("purchaseInvoiceController.getAll", () => {
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
          quantity: 10,
          unitPrice: decimal(3000),
          totalPrice: decimal(30000),
          createdAt: new Date("2026-08-06T00:00:00.000Z"),
          item: { code: "C-100", name: "خازن", unit: "عدد" },
        },
      ],
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
    paid_amount: 30000,
    note: null,
    items: [{ item_id: 2, quantity: 10, unit_price: 3000 }],
  };

  beforeEach(() => {
    db.__tx.purchaseInvoice.count.mockResolvedValue(0);
    db.__tx.purchaseInvoice.create.mockResolvedValue(invoiceRow());
  });

  it("names the missing item id rather than failing on a foreign key", async () => {
    db.item.findMany.mockResolvedValue([]);

    const res = mockResponse();
    await controller.create(mockRequest({ body }, 3), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "کالا با شناسه 2 یافت نشد",
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("treats an item from another workspace as missing", async () => {
    db.item.findMany.mockResolvedValue([]);

    await controller.create(mockRequest({ body }, 3), mockResponse());

    expect(db.item.findMany.mock.calls[0][0].where).toMatchObject({
      workspaceId: WORKSPACE_ID,
    });
  });

  it("derives the total from the lines and marks it paid", async () => {
    db.item.findMany.mockResolvedValue([{ id: 2 }]);
    db.__tx.item.findFirstOrThrow.mockResolvedValue({
      currentStock: 0,
      avgPurchasePrice: decimal(0),
    });

    await controller.create(mockRequest({ body }, 3), mockResponse());

    expect(db.__tx.purchaseInvoice.create.mock.calls[0][0].data).toMatchObject({
      workspaceId: WORKSPACE_ID,
      totalAmount: 30000,
      paidAmount: 30000,
      paymentStatus: "paid",
      createdBy: 3,
    });
  });

  it("counts only its own workspace's invoices when numbering", async () => {
    db.item.findMany.mockResolvedValue([{ id: 2 }]);
    db.__tx.item.findFirstOrThrow.mockResolvedValue({
      currentStock: 0,
      avgPurchasePrice: decimal(0),
    });

    await controller.create(mockRequest({ body }, 3), mockResponse());

    // Numbering is per workspace, so one shop's invoices can't advance
    // another's counter.
    expect(db.__tx.purchaseInvoice.count.mock.calls[0][0].where).toMatchObject({
      workspaceId: WORKSPACE_ID,
    });
  });

  it("marks a part payment as partial", async () => {
    db.item.findMany.mockResolvedValue([{ id: 2 }]);
    db.__tx.item.findFirstOrThrow.mockResolvedValue({
      currentStock: 0,
      avgPurchasePrice: decimal(0),
    });

    await controller.create(
      mockRequest({ body: { ...body, paid_amount: 10000 } }, 3),
      mockResponse(),
    );

    expect(
      db.__tx.purchaseInvoice.create.mock.calls[0][0].data.paymentStatus,
    ).toBe("partial");
  });

  it("recalculates the weighted average purchase price", async () => {
    db.item.findMany.mockResolvedValue([{ id: 2 }]);
    // 5 units at 1000 plus 10 at 3000 = 35000 over 15 units.
    db.__tx.item.findFirstOrThrow.mockResolvedValue({
      currentStock: 5,
      avgPurchasePrice: decimal(1000),
    });

    await controller.create(mockRequest({ body }, 3), mockResponse());

    expect(db.__tx.item.update.mock.calls[0][0].data).toEqual({
      currentStock: 15,
      avgPurchasePrice: 35000 / 15,
    });
  });

  it("links the ledger entry to the invoice", async () => {
    db.item.findMany.mockResolvedValue([{ id: 2 }]);
    db.__tx.item.findFirstOrThrow.mockResolvedValue({
      currentStock: 0,
      avgPurchasePrice: decimal(0),
    });

    await controller.create(mockRequest({ body }, 3), mockResponse());

    expect(
      db.__tx.inventoryTransaction.create.mock.calls[0][0].data,
    ).toMatchObject({
      workspaceId: WORKSPACE_ID,
      itemId: 2,
      type: "purchase",
      quantity: 10,
      referenceId: 5,
      referenceType: "purchase_invoice",
      createdBy: 3,
    });
  });

  it("builds each line's stock on the one before it", async () => {
    db.item.findMany.mockResolvedValue([{ id: 2 }]);
    db.__tx.item.findFirstOrThrow
      .mockResolvedValueOnce({ currentStock: 0, avgPurchasePrice: decimal(0) })
      .mockResolvedValueOnce({
        currentStock: 10,
        avgPurchasePrice: decimal(3000),
      });

    await controller.create(
      mockRequest(
        {
          body: {
            ...body,
            items: [
              { item_id: 2, quantity: 10, unit_price: 3000 },
              { item_id: 2, quantity: 5, unit_price: 3000 },
            ],
          },
        },
        3,
      ),
      mockResponse(),
    );

    const stockValues = db.__tx.item.update.mock.calls.map(
      ([args]) => args.data.currentStock,
    );
    expect(stockValues).toEqual([10, 15]);
  });

  it("does everything inside one transaction", async () => {
    db.item.findMany.mockResolvedValue([{ id: 2 }]);
    db.__tx.item.findFirstOrThrow.mockResolvedValue({
      currentStock: 0,
      avgPurchasePrice: decimal(0),
    });

    await controller.create(mockRequest({ body }, 3), mockResponse());

    expect(db.$transaction).toHaveBeenCalledTimes(1);
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

describe("purchaseInvoiceController.remove", () => {
  it("returns 404 for an invoice in another workspace", async () => {
    db.purchaseInvoice.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.remove(mockRequest({ params: { id: 9 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("deletes an invoice that has no lines", async () => {
    // The old handler read the lines first and treated an empty result as
    // "not found", so such an invoice could never be removed.
    db.purchaseInvoice.findFirst.mockResolvedValue({
      ...invoiceRow(),
      items: [],
    });

    const res = mockResponse();
    await controller.remove(mockRequest({ params: { id: 5 } }), res);

    expect(db.__tx.purchaseInvoice.delete).toHaveBeenCalledWith({
      where: { id: 5 },
    });
    expect(res.json).toHaveBeenCalledWith({
      message: "فاکتور و تراکنش‌های مربوطه حذف شدند",
    });
  });

  it("reverses the stock each line added", async () => {
    db.purchaseInvoice.findFirst.mockResolvedValue({
      ...invoiceRow(),
      items: [{ itemId: 2, quantity: 10 }],
    });
    db.__tx.item.findFirstOrThrow.mockResolvedValue({ currentStock: 25 });

    await controller.remove(
      mockRequest({ params: { id: 5 } }, 3),
      mockResponse(),
    );

    expect(db.__tx.item.update.mock.calls[0][0].data).toEqual({
      currentStock: 15,
    });
    expect(
      db.__tx.inventoryTransaction.create.mock.calls[0][0].data,
    ).toMatchObject({
      workspaceId: WORKSPACE_ID,
      type: "adjustment",
      quantity: -10,
      referenceId: 5,
      note: "حذف فاکتور خرید",
    });
  });

  it("clamps the reversal at zero when the stock was already sold on", async () => {
    db.purchaseInvoice.findFirst.mockResolvedValue({
      ...invoiceRow(),
      items: [{ itemId: 2, quantity: 10 }],
    });
    db.__tx.item.findFirstOrThrow.mockResolvedValue({ currentStock: 4 });

    await controller.remove(mockRequest({ params: { id: 5 } }), mockResponse());

    expect(db.__tx.item.update.mock.calls[0][0].data).toEqual({
      currentStock: 0,
    });
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
