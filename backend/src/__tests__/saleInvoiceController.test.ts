import { Request, Response } from "express";
import * as controller from "../controllers/saleInvoiceController";
import prisma, { runInWorkspaceTransaction } from "../lib/prisma";

jest.mock("../lib/prisma", () => {
  const tx = {
    workspace: { update: jest.fn() },
    saleInvoice: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    saleInvoiceItem: { create: jest.fn(), deleteMany: jest.fn() },
    // findFirst variants rather than findUnique: the controller pairs the
    // item id with workspaceId now, which findUnique can't express.
    item: {
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      update: jest.fn(),
    },
    inventoryTransaction: { create: jest.fn() },
  };

  return {
    __esModule: true,
    default: {
      saleInvoice: {
        // Pagination's total, not invoice numbering — that moved to the
        // workspace counter.
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

const db = prisma as unknown as {
  saleInvoice: Record<string, jest.Mock>;

  __tx: {
    workspace: Record<string, jest.Mock>;
    saleInvoice: Record<string, jest.Mock>;
    saleInvoiceItem: Record<string, jest.Mock>;
    item: Record<string, jest.Mock>;
    inventoryTransaction: Record<string, jest.Mock>;
  };
};

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
    invoiceNumber: "SAL-20260806-001",
    customerId: 2,
    customerName: "رضا",
    customerPhone: "0912",
    deviceId: null,
    invoiceDate: new Date("2026-08-06T00:00:00.000Z"),
    totalAmount: decimal(30000),
    paidAmount: decimal(30000),
    paymentStatus: "paid",
    note: null,
    createdBy: 3,
    createdAt: new Date("2026-08-06T00:00:00.000Z"),
    updatedAt: new Date("2026-08-06T00:00:00.000Z"),
    device: null,
    ...overrides,
  };
}

const inventoryLine = {
  item_type: "inventory",
  item_id: 2,
  name: null,
  unit: null,
  quantity: 3,
  unit_price: 10000,
};

const customLine = {
  item_type: "custom",
  item_id: null,
  name: "اجرت",
  unit: null,
  quantity: 1,
  unit_price: 5000,
};

const listQuery = { page: 1, limit: 10 };

beforeEach(() => {
  jest.clearAllMocks();
});

describe("saleInvoiceController.getAll", () => {
  it("spreads the device onto the invoice without the serial", async () => {
    db.saleInvoice.count.mockResolvedValue(1);
    db.saleInvoice.findMany.mockResolvedValue([
      invoiceRow({
        deviceId: 7,
        device: {
          deviceName: "یخچال",
          brand: "سامسونگ",
          model: "X1",
          serialNumber: "SN1",
        },
      }),
    ]);

    const res = mockResponse();
    await controller.getAll(mockRequest({ query: listQuery }), res);

    const invoice = res.json.mock.calls[0][0].data[0];
    expect(invoice).toMatchObject({
      device_id: 7,
      device_name: "یخچال",
      brand: "سامسونگ",
      model: "X1",
    });
    expect(invoice).not.toHaveProperty("serial_number");
  });

  it("scopes the listing to the caller's workspace", async () => {
    db.saleInvoice.count.mockResolvedValue(0);
    db.saleInvoice.findMany.mockResolvedValue([]);

    await controller.getAll(mockRequest({ query: listQuery }), mockResponse());

    expect(db.saleInvoice.findMany.mock.calls[0][0].where).toEqual({
      workspaceId: WORKSPACE_ID,
    });
  });

  it("fetches devices in the same query rather than one per invoice", async () => {
    db.saleInvoice.count.mockResolvedValue(0);
    db.saleInvoice.findMany.mockResolvedValue([]);

    await controller.getAll(mockRequest({ query: listQuery }), mockResponse());

    expect(db.saleInvoice.findMany).toHaveBeenCalledTimes(1);
    expect(db.saleInvoice.findMany.mock.calls[0][0].include).toHaveProperty(
      "device",
    );
  });

  it("searches name, phone and invoice number", async () => {
    db.saleInvoice.count.mockResolvedValue(0);
    db.saleInvoice.findMany.mockResolvedValue([]);

    await controller.getAll(
      mockRequest({ query: { ...listQuery, search: "رضا" } }),
      mockResponse(),
    );

    expect(db.saleInvoice.findMany.mock.calls[0][0].where.OR).toHaveLength(3);
  });

  it("filters by several payment statuses", async () => {
    db.saleInvoice.count.mockResolvedValue(0);
    db.saleInvoice.findMany.mockResolvedValue([]);

    await controller.getAll(
      mockRequest({
        query: { ...listQuery, payment_status: ["paid", "partial"] },
      }),
      mockResponse(),
    );

    expect(db.saleInvoice.findMany.mock.calls[0][0].where).toMatchObject({
      workspaceId: WORKSPACE_ID,
      paymentStatus: { in: ["paid", "partial"] },
    });
  });

  it("includes invoices recorded during the day the range ends on", async () => {
    db.saleInvoice.count.mockResolvedValue(0);
    db.saleInvoice.findMany.mockResolvedValue([]);

    const to = new Date("2026-01-31T00:00:00.000Z");

    await controller.getAll(
      mockRequest({ query: { ...listQuery, date_to: to } }),
      mockResponse(),
    );

    const filter = db.saleInvoice.findMany.mock.calls[0][0].where
      .invoiceDate as { lte: Date };
    expect(filter.lte.getUTCDate()).toBe(31);
    expect(filter.lte.getUTCHours()).toBe(23);
  });

  it("combines both ends of an amount range into one filter", async () => {
    db.saleInvoice.count.mockResolvedValue(0);
    db.saleInvoice.findMany.mockResolvedValue([]);

    await controller.getAll(
      mockRequest({
        query: { ...listQuery, amount_from: 1000, amount_to: 5000 },
      }),
      mockResponse(),
    );

    expect(db.saleInvoice.findMany.mock.calls[0][0].where).toMatchObject({
      totalAmount: { gte: 1000, lte: 5000 },
    });
  });
});

describe("saleInvoiceController.getById", () => {
  it("returns 404 for an invoice in another workspace", async () => {
    db.saleInvoice.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.getById(mockRequest({ params: { id: 9 } }), res);

    expect(db.saleInvoice.findFirst.mock.calls[0][0].where).toEqual({
      id: 9,
      workspaceId: WORKSPACE_ID,
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("prefers the catalogue name over the copy stored on the line", async () => {
    db.saleInvoice.findFirst.mockResolvedValue({
      ...invoiceRow(),
      items: [
        {
          id: 1,
          invoiceId: 5,
          itemId: 2,
          quantity: 3,
          unitPrice: decimal(10000),
          totalPrice: decimal(30000),
          createdAt: new Date("2026-08-06T00:00:00.000Z"),
          name: "نام قدیمی",
          unit: "عدد",
          item: {
            code: "C-100",
            name: "خازن",
            unit: "عدد",
            currentStock: 12,
          },
        },
      ],
    });

    const res = mockResponse();
    await controller.getById(mockRequest({ params: { id: 5 } }), res);

    expect(res.json.mock.calls[0][0].items[0]).toMatchObject({
      item_name: "خازن",
      item_code: "C-100",
      current_stock: 12,
    });
  });

  it("falls back to the line's own name for a custom line", async () => {
    db.saleInvoice.findFirst.mockResolvedValue({
      ...invoiceRow(),
      items: [
        {
          id: 1,
          invoiceId: 5,
          itemId: null,
          quantity: 1,
          unitPrice: decimal(5000),
          totalPrice: decimal(5000),
          createdAt: new Date("2026-08-06T00:00:00.000Z"),
          name: "اجرت",
          unit: "عدد",
          item: null,
        },
      ],
    });

    const res = mockResponse();
    await controller.getById(mockRequest({ params: { id: 5 } }), res);

    expect(res.json.mock.calls[0][0].items[0]).toMatchObject({
      item_name: "اجرت",
      item_code: null,
      current_stock: null,
    });
  });

  it("includes the serial number, unlike the list endpoint", async () => {
    db.saleInvoice.findFirst.mockResolvedValue({
      ...invoiceRow({
        deviceId: 7,
        device: {
          deviceName: "یخچال",
          brand: null,
          model: null,
          serialNumber: "SN1",
        },
      }),
      items: [],
    });

    const res = mockResponse();
    await controller.getById(mockRequest({ params: { id: 5 } }), res);

    expect(res.json.mock.calls[0][0].serial_number).toBe("SN1");
  });
});

describe("saleInvoiceController.create", () => {
  const body = {
    customer_id: 2,
    customer_name: "رضا",
    customer_phone: "0912",
    device_id: null,
    invoice_date: undefined,
    paid_amount: 30000,
    note: null,
    items: [inventoryLine],
  };

  beforeEach(() => {
    db.__tx.workspace.update.mockResolvedValue({ saleSeq: 1 });
    db.__tx.saleInvoice.create.mockResolvedValue(invoiceRow());
  });

  it("names the item whose stock is short", async () => {
    db.__tx.item.findFirst.mockResolvedValue({
      name: "خازن",
      currentStock: 1,
    });

    const res = mockResponse();
    await controller.create(mockRequest({ body }, 3), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'موجودی کالای "خازن" کافی نیست. موجودی فعلی: 1',
    });
    expect(db.__tx.saleInvoice.create).not.toHaveBeenCalled();
  });

  it("treats an item from another workspace as missing", async () => {
    db.__tx.item.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.create(mockRequest({ body }, 3), res);

    expect(db.__tx.item.findFirst.mock.calls[0][0].where).toMatchObject({
      workspaceId: WORKSPACE_ID,
    });
    expect(res.json).toHaveBeenCalledWith({
      error: "کالا با شناسه 2 یافت نشد",
    });
  });

  it("takes its number from its own workspace's counter", async () => {
    db.__tx.item.findFirst.mockResolvedValue({
      name: "خازن",
      currentStock: 10,
    });
    db.__tx.item.findFirstOrThrow.mockResolvedValue({ currentStock: 10 });

    await controller.create(mockRequest({ body }, 3), mockResponse());

    expect(db.__tx.workspace.update).toHaveBeenCalledWith({
      where: { id: WORKSPACE_ID },
      data: { saleSeq: { increment: 1 } },
      select: { saleSeq: true },
    });
    expect(db.__tx.saleInvoice.create.mock.calls[0][0].data.invoiceNumber).toBe(
      "SAL-0001",
    );
  });

  it("links the ledger entry to the invoice", async () => {
    db.__tx.item.findFirst.mockResolvedValue({
      name: "خازن",
      currentStock: 10,
    });
    db.__tx.item.findFirstOrThrow.mockResolvedValue({ currentStock: 10 });

    await controller.create(mockRequest({ body }, 3), mockResponse());

    expect(
      db.__tx.inventoryTransaction.create.mock.calls[0][0].data,
    ).toMatchObject({
      workspaceId: WORKSPACE_ID,
      itemId: 2,
      type: "sale",
      quantity: -3,
      referenceId: 5,
      referenceType: "sale_invoice",
      createdBy: 3,
    });
  });

  it("stores a custom line without touching stock", async () => {
    await controller.create(
      mockRequest({ body: { ...body, items: [customLine] } }, 3),
      mockResponse(),
    );

    expect(db.__tx.saleInvoiceItem.create.mock.calls[0][0].data).toMatchObject({
      workspaceId: WORKSPACE_ID,
      itemId: null,
      name: "اجرت",
      unit: "عدد",
    });
    expect(db.__tx.item.update).not.toHaveBeenCalled();
    expect(db.__tx.inventoryTransaction.create).not.toHaveBeenCalled();
  });

  it("derives the total from the lines", async () => {
    db.__tx.item.findFirst.mockResolvedValue({
      name: "خازن",
      currentStock: 10,
    });
    db.__tx.item.findFirstOrThrow.mockResolvedValue({ currentStock: 10 });

    await controller.create(mockRequest({ body }, 3), mockResponse());

    expect(db.__tx.saleInvoice.create.mock.calls[0][0].data).toMatchObject({
      workspaceId: WORKSPACE_ID,
      totalAmount: 30000,
      paymentStatus: "paid",
      createdBy: 3,
    });
  });
});

describe("saleInvoiceController.update", () => {
  const body = {
    customer_id: 2,
    customer_name: "رضا",
    customer_phone: "0912",
    device_id: null,
    invoice_date: undefined,
    paid_amount: 30000,
    note: null,
    items: [inventoryLine],
  };

  it("returns 404 for an invoice in another workspace", async () => {
    db.saleInvoice.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.update(mockRequest({ params: { id: 9 }, body }, 3), res);

    expect(db.saleInvoice.findFirst.mock.calls[0][0].where).toEqual({
      id: 9,
      workspaceId: WORKSPACE_ID,
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(runInTx).not.toHaveBeenCalled();
  });

  it("puts the old stock back before validating the new lines", async () => {
    db.saleInvoice.findFirst.mockResolvedValue({
      ...invoiceRow(),
      items: [{ itemId: 2, quantity: 3 }],
    });
    db.__tx.item.findFirstOrThrow.mockResolvedValue({ currentStock: 7 });
    db.__tx.item.findFirst.mockResolvedValue({
      name: "خازن",
      currentStock: 10,
    });

    await controller.update(
      mockRequest({ params: { id: 5 }, body }, 3),
      mockResponse(),
    );

    // First write returns the three units this invoice was holding.
    expect(db.__tx.item.update.mock.calls[0][0].data).toEqual({
      currentStock: 10,
    });
  });

  it("rolls back when the new lines exceed stock", async () => {
    db.saleInvoice.findFirst.mockResolvedValue({
      ...invoiceRow(),
      items: [{ itemId: 2, quantity: 3 }],
    });
    db.__tx.item.findFirstOrThrow.mockResolvedValue({ currentStock: 0 });
    db.__tx.item.findFirst.mockResolvedValue({
      name: "خازن",
      currentStock: 3,
    });

    const res = mockResponse();
    await controller.update(
      mockRequest(
        {
          params: { id: 5 },
          body: { ...body, items: [{ ...inventoryLine, quantity: 99 }] },
        },
        3,
      ),
      res,
    );

    // The rejection has to travel as a throw so the returned stock is undone —
    // the old handler wrote it back and then returned, inflating stock for good.
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.__tx.saleInvoice.update).not.toHaveBeenCalled();
    expect(db.__tx.saleInvoiceItem.deleteMany).not.toHaveBeenCalled();
  });

  it("replaces the lines and answers with a message only", async () => {
    db.saleInvoice.findFirst.mockResolvedValue({
      ...invoiceRow(),
      items: [],
    });
    db.__tx.item.findFirst.mockResolvedValue({
      name: "خازن",
      currentStock: 10,
    });
    db.__tx.item.findFirstOrThrow.mockResolvedValue({ currentStock: 10 });

    const res = mockResponse();
    await controller.update(mockRequest({ params: { id: 5 }, body }, 3), res);

    // No workspace filter needed on the delete: the invoice was already
    // resolved through one, so its lines can only be this workspace's.
    expect(db.__tx.saleInvoiceItem.deleteMany).toHaveBeenCalledWith({
      where: { invoiceId: 5 },
    });
    expect(res.json).toHaveBeenCalledWith({
      message: "فاکتور با موفقیت ویرایش شد",
    });
  });
});

describe("saleInvoiceController.updatePayment", () => {
  it("returns 404 for an invoice in another workspace", async () => {
    db.saleInvoice.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.updatePayment(
      mockRequest({ params: { id: 9 }, body: { paid_amount: 100 } }),
      res,
    );

    expect(db.saleInvoice.findFirst.mock.calls[0][0].where).toEqual({
      id: 9,
      workspaceId: WORKSPACE_ID,
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.saleInvoice.update).not.toHaveBeenCalled();
  });

  it("recomputes the status from the new amount", async () => {
    db.saleInvoice.findFirst.mockResolvedValue({
      totalAmount: decimal(30000),
    });
    db.saleInvoice.update.mockResolvedValue(invoiceRow());

    const res = mockResponse();
    await controller.updatePayment(
      mockRequest({ params: { id: 5 }, body: { paid_amount: 10000 } }),
      res,
    );

    expect(db.saleInvoice.update.mock.calls[0][0].data).toEqual({
      paidAmount: 10000,
      paymentStatus: "partial",
    });
  });
});

describe("saleInvoiceController.remove", () => {
  it("returns 404 for an invoice in another workspace", async () => {
    db.saleInvoice.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.remove(mockRequest({ params: { id: 9 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(runInTx).not.toHaveBeenCalled();
  });

  it("deletes an invoice that has no lines", async () => {
    db.saleInvoice.findFirst.mockResolvedValue({
      ...invoiceRow(),
      items: [],
    });

    const res = mockResponse();
    await controller.remove(mockRequest({ params: { id: 5 } }), res);

    expect(db.__tx.saleInvoice.delete).toHaveBeenCalledWith({
      where: { id: 5 },
    });
    expect(res.json).toHaveBeenCalledWith({
      message: "فاکتور فروش حذف و موجودی کالاها بازگردانده شد",
    });
  });

  it("returns the stock each inventory line took", async () => {
    db.saleInvoice.findFirst.mockResolvedValue({
      ...invoiceRow(),
      items: [
        { itemId: 2, quantity: 3 },
        { itemId: null, quantity: 1 },
      ],
    });
    db.__tx.item.findFirstOrThrow.mockResolvedValue({ currentStock: 7 });

    await controller.remove(
      mockRequest({ params: { id: 5 } }, 3),
      mockResponse(),
    );

    // Only the inventory line moves stock; the custom line is skipped.
    expect(db.__tx.item.update).toHaveBeenCalledTimes(1);
    expect(db.__tx.item.update.mock.calls[0][0].data).toEqual({
      currentStock: 10,
    });
    expect(
      db.__tx.inventoryTransaction.create.mock.calls[0][0].data,
    ).toMatchObject({
      workspaceId: WORKSPACE_ID,
      type: "adjustment",
      quantity: 3,
      referenceId: 5,
      note: "ابطال فاکتور فروش",
    });
  });
});
