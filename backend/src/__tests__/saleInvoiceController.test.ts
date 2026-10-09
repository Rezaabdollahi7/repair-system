import { Request, Response } from "express";
import * as controller from "../controllers/saleInvoiceController";
import prisma, { runInWorkspaceTransaction } from "../lib/prisma";
import { applyStockMovements, InsufficientStockError } from "../utils/stock";
import { resolveWarehouseId } from "../utils/warehouse";

jest.mock("../lib/prisma", () => {
  const tx = {
    workspace: { update: jest.fn() },
    saleInvoice: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
    saleInvoiceItem: { createMany: jest.fn(), deleteMany: jest.fn() },
    // The row lock an edit or delete takes before reading the invoice. One
    // row back means the invoice exists in this workspace.
    $queryRaw: jest.fn(),
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

// The arithmetic and locking are the stock service's, with suites of their
// own. Here: what this controller hands it, and what it does with the
// answer. The error classes stay real for the controller's instanceof.
jest.mock("../utils/stock", () => ({
  ...jest.requireActual("../utils/stock"),
  applyStockMovements: jest.fn(),
}));

jest.mock("../utils/warehouse", () => ({
  resolveWarehouseId: jest.fn(),
}));

const db = prisma as unknown as {
  saleInvoice: Record<string, jest.Mock>;

  __tx: {
    workspace: Record<string, jest.Mock>;
    saleInvoice: Record<string, jest.Mock>;
    saleInvoiceItem: Record<string, jest.Mock>;
    $queryRaw: jest.Mock;
  };
};

const applyMovements = applyStockMovements as unknown as jest.Mock;
const resolveWarehouse = resolveWarehouseId as unknown as jest.Mock;
const MAIN_WAREHOUSE = 4;

/** What the service answers for a sale line: the cost it left at. */
function movedAt(...costs: number[]) {
  return costs.map((unitCost) => ({ unitCost }));
}

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
    warehouseId: MAIN_WAREHOUSE,
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
  resolveWarehouse.mockResolvedValue(MAIN_WAREHOUSE);
  applyMovements.mockResolvedValue([]);
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
          quantity: decimal(3),
          unitPrice: decimal(10000),
          totalPrice: decimal(30000),
          createdAt: new Date("2026-08-06T00:00:00.000Z"),
          name: "نام قدیمی",
          unit: "عدد",
          item: {
            code: "C-100",
            name: "خازن",
            unit: "عدد",
            currentStock: decimal(12),
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
          quantity: decimal(1),
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
    warehouse_id: undefined,
    invoice_date: undefined,
    paid_amount: 30000,
    note: null,
    items: [inventoryLine],
  };

  beforeEach(() => {
    db.__tx.workspace.update.mockResolvedValue({ saleSeq: 1 });
    db.__tx.saleInvoice.create.mockResolvedValue(invoiceRow());
    applyMovements.mockResolvedValue(movedAt(7000));
  });

  it("takes each inventory line off the shelf, against this invoice", async () => {
    await controller.create(mockRequest({ body }, 3), mockResponse());

    const [, workspaceId, document, lines] = applyMovements.mock.calls[0];
    expect(workspaceId).toBe(WORKSPACE_ID);
    expect(document).toMatchObject({
      referenceType: "sale_invoice",
      referenceId: 5,
      actorId: 3,
    });
    expect(lines).toEqual([
      {
        itemId: 2,
        warehouseId: MAIN_WAREHOUSE,
        quantity: -3,
        type: "sale",
        unitPrice: 10000,
        note: "فروش از فاکتور",
      },
    ]);
  });

  it("keeps the cost each line left at, for the margin later", async () => {
    await controller.create(mockRequest({ body }), mockResponse());

    expect(
      db.__tx.saleInvoiceItem.createMany.mock.calls[0][0].data[0],
    ).toMatchObject({
      itemId: 2,
      quantity: 3,
      totalPrice: 30000,
      unitCost: 7000,
    });
  });

  it("stores a custom line without moving stock or giving it a cost", async () => {
    applyMovements.mockResolvedValue(movedAt(7000));

    await controller.create(
      mockRequest({ body: { ...body, items: [customLine, inventoryLine] } }),
      mockResponse(),
    );

    // Only the inventory line reaches the stock service…
    expect(applyMovements.mock.calls[0][3]).toHaveLength(1);
    // …and the costs line up with the inventory lines, not with every line.
    const rows = db.__tx.saleInvoiceItem.createMany.mock.calls[0][0].data;
    expect(rows[0]).toMatchObject({
      itemId: null,
      name: "اجرت",
      unit: "عدد",
      unitCost: null,
    });
    expect(rows[1]).toMatchObject({ itemId: 2, unitCost: 7000 });
  });

  it("issues from the warehouse it names", async () => {
    resolveWarehouse.mockResolvedValue(9);

    await controller.create(
      mockRequest({ body: { ...body, warehouse_id: 9 } }),
      mockResponse(),
    );

    expect(resolveWarehouse).toHaveBeenCalledWith(
      expect.anything(),
      WORKSPACE_ID,
      9,
    );
    expect(applyMovements.mock.calls[0][3][0].warehouseId).toBe(9);
    expect(db.__tx.saleInvoice.create.mock.calls[0][0].data.warehouseId).toBe(
      9,
    );
  });

  it("does the invoice and its stock inside one transaction", async () => {
    await controller.create(mockRequest({ body }), mockResponse());

    expect(runInTx).toHaveBeenCalledWith(WORKSPACE_ID, expect.any(Function));
  });

  it("names the item whose stock is short", async () => {
    applyMovements.mockRejectedValue(
      new InsufficientStockError(2, "خازن", 1, 3),
    );

    const res = mockResponse();
    await controller.create(mockRequest({ body }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain("«خازن»");
    expect(db.__tx.saleInvoiceItem.createMany).not.toHaveBeenCalled();
  });

  it("takes its number from its own workspace's counter", async () => {
    await controller.create(mockRequest({ body }), mockResponse());

    expect(db.__tx.workspace.update).toHaveBeenCalledWith({
      where: { id: WORKSPACE_ID },
      data: { saleSeq: { increment: 1 } },
      select: { saleSeq: true },
    });
    expect(db.__tx.saleInvoice.create.mock.calls[0][0].data.invoiceNumber).toBe(
      "SAL-0001",
    );
  });

  it("derives the total from the lines, rounding fractions to whole rials", async () => {
    applyMovements.mockResolvedValue(movedAt(7000, 100));

    await controller.create(
      mockRequest({
        body: {
          ...body,
          items: [
            inventoryLine,
            { ...inventoryLine, item_id: 6, quantity: 1.5, unit_price: 1001 },
          ],
        },
      }),
      mockResponse(),
    );

    // 30000 + 1501.5 → 1502.
    expect(db.__tx.saleInvoice.create.mock.calls[0][0].data.totalAmount).toBe(
      31502,
    );
  });
});

describe("saleInvoiceController.update", () => {
  const body = {
    customer_id: 2,
    customer_name: "رضا",
    customer_phone: "0912",
    device_id: null,
    warehouse_id: undefined,
    invoice_date: new Date("2026-09-01T00:00:00.000Z"),
    paid_amount: 0,
    note: null,
    items: [{ ...inventoryLine, quantity: 5 }],
  };

  function lockedInvoice(items: unknown[]) {
    db.__tx.$queryRaw.mockResolvedValue([{ id: 5 }]);
    db.__tx.saleInvoice.findFirst.mockResolvedValue({ ...invoiceRow(), items });
  }

  const threeAt6000 = {
    itemId: 2,
    quantity: decimal(3),
    unitCost: decimal(6000),
  };

  it("returns 404 for an invoice in another workspace", async () => {
    db.__tx.$queryRaw.mockResolvedValue([]);

    const res = mockResponse();
    await controller.update(mockRequest({ params: { id: 9 }, body }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(applyMovements).not.toHaveBeenCalled();
  });

  it("puts the old lines back before taking the new ones, in one call", async () => {
    // One call, so a refusal of the new lines undoes the return as well.
    lockedInvoice([threeAt6000]);
    applyMovements.mockResolvedValue([{ unitCost: 6000 }, { unitCost: 6500 }]);

    await controller.update(
      mockRequest({ params: { id: 5 }, body }, 3),
      mockResponse(),
    );

    expect(applyMovements).toHaveBeenCalledTimes(1);
    const lines = applyMovements.mock.calls[0][3];
    expect(lines).toEqual([
      {
        itemId: 2,
        warehouseId: MAIN_WAREHOUSE,
        quantity: 3,
        type: "reversal",
        // Back at the cost they left at.
        unitCost: 6000,
        note: "ویرایش فاکتور فروش",
      },
      expect.objectContaining({ type: "sale", quantity: -5 }),
    ]);
    // The new row keeps the new sale's cost, not the returned one's.
    expect(
      db.__tx.saleInvoiceItem.createMany.mock.calls[0][0].data[0].unitCost,
    ).toBe(6500);
  });

  it("returns a line from before 14.6 at the current average", async () => {
    lockedInvoice([{ ...threeAt6000, unitCost: null }]);
    applyMovements.mockResolvedValue([{ unitCost: 0 }, { unitCost: 0 }]);

    await controller.update(
      mockRequest({ params: { id: 5 }, body }),
      mockResponse(),
    );

    expect(applyMovements.mock.calls[0][3][0].unitCost).toBeNull();
  });

  it("rolls back when the new lines exceed stock", async () => {
    lockedInvoice([threeAt6000]);
    applyMovements.mockRejectedValue(
      new InsufficientStockError(2, "خازن", 4, 5),
    );

    const res = mockResponse();
    await controller.update(mockRequest({ params: { id: 5 }, body }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.__tx.saleInvoiceItem.deleteMany).not.toHaveBeenCalled();
    expect(db.__tx.saleInvoice.update).not.toHaveBeenCalled();
  });

  it("replaces the lines and answers with a message only", async () => {
    lockedInvoice([threeAt6000]);
    applyMovements.mockResolvedValue([{ unitCost: 6000 }, { unitCost: 6000 }]);

    const res = mockResponse();
    await controller.update(mockRequest({ params: { id: 5 }, body }), res);

    expect(db.__tx.saleInvoiceItem.deleteMany).toHaveBeenCalledWith({
      where: { invoiceId: 5 },
    });
    expect(db.__tx.saleInvoice.update.mock.calls[0][0].data).not.toHaveProperty(
      "invoiceNumber",
    );
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
    db.__tx.$queryRaw.mockResolvedValue([]);

    const res = mockResponse();
    await controller.remove(mockRequest({ params: { id: 9 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.__tx.saleInvoice.delete).not.toHaveBeenCalled();
  });

  it("deletes an invoice that has no lines", async () => {
    db.__tx.$queryRaw.mockResolvedValue([{ id: 5 }]);
    db.__tx.saleInvoice.findFirst.mockResolvedValue({
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

  it("returns the stock each inventory line took, and only those", async () => {
    db.__tx.$queryRaw.mockResolvedValue([{ id: 5 }]);
    db.__tx.saleInvoice.findFirst.mockResolvedValue({
      ...invoiceRow(),
      items: [
        { itemId: 2, quantity: decimal(3), unitCost: decimal(7000) },
        { itemId: null, quantity: decimal(1), unitCost: null },
      ],
    });

    await controller.remove(
      mockRequest({ params: { id: 5 } }, 3),
      mockResponse(),
    );

    const [, , document, lines] = applyMovements.mock.calls[0];
    expect(document).toMatchObject({ referenceId: 5, actorId: 3 });
    expect(lines).toEqual([
      {
        itemId: 2,
        warehouseId: MAIN_WAREHOUSE,
        quantity: 3,
        type: "reversal",
        unitCost: 7000,
        note: "ابطال فاکتور فروش",
      },
    ]);
  });
});
