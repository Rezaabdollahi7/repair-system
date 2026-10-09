import { Request, Response } from "express";
import * as controller from "../controllers/repairInvoiceController";
import prisma, { runInWorkspaceTransaction } from "../lib/prisma";
import { applyStockMovements, InsufficientStockError } from "../utils/stock";
import { resolveWarehouseId } from "../utils/warehouse";

jest.mock("../lib/prisma", () => {
  const tx = {
    // settings is gone with the local invoice-number helper: the prefix is
    // fixed per invoice kind now, and the counter lives on the workspace row.
    workspace: { update: jest.fn() },
    repairInvoice: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
    repairInvoiceItem: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },
    repairInvoicePayment: { create: jest.fn() },
    // The catalogue lookup a پیش‌فاکتور's inventory lines are checked
    // against, scoped by workspace.
    item: { findMany: jest.fn() },
    // The row lock every edit, status change and delete takes first. One
    // row back means the invoice exists in this workspace.
    $queryRaw: jest.fn(),
  };

  return {
    __esModule: true,
    default: {
      repairInvoice: {
        count: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      device: { findFirst: jest.fn() },
      // getById's lookup of each inventory line's code and unit.
      item: { findMany: jest.fn() },
      __tx: tx,
    },
    // Named alongside the default export now that controllers import both.
    // Runs the callback against the same mocks the assertions inspect.
    runInWorkspaceTransaction: jest.fn(
      (_workspaceId: number, fn: (client: unknown) => unknown) => fn(tx),
    ),
  };
});

// The stock arithmetic and locking are the stock service's, tested on their
// own. Here: which parts this controller asks it to move, and when.
jest.mock("../utils/stock", () => ({
  ...jest.requireActual("../utils/stock"),
  applyStockMovements: jest.fn(),
}));

jest.mock("../utils/warehouse", () => ({
  resolveWarehouseId: jest.fn(),
}));

const db = prisma as unknown as {
  repairInvoice: Record<string, jest.Mock>;
  device: Record<string, jest.Mock>;
  item: Record<string, jest.Mock>;
  __tx: {
    workspace: Record<string, jest.Mock>;
    repairInvoice: Record<string, jest.Mock>;
    repairInvoiceItem: Record<string, jest.Mock>;
    repairInvoicePayment: Record<string, jest.Mock>;
    item: Record<string, jest.Mock>;
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
    invoiceNumber: "REP-0001",
    deviceId: 7,
    customerId: 2,
    customerName: "رضا",
    customerPhone: "0912",
    invoiceDate: new Date("2026-08-06T00:00:00.000Z"),
    dueDate: null,
    status: "draft",
    subtotal: decimal(200000),
    discountType: null,
    discountValue: decimal(0),
    discountAmount: decimal(0),
    taxRate: decimal(0),
    taxAmount: decimal(0),
    totalAmount: decimal(200000),
    paidAmount: decimal(0),
    paymentStatus: "pending",
    warrantyMonths: 0,
    warrantyUntil: null,
    technicianId: null,
    notes: null,
    createdBy: 3,
    createdAt: new Date("2026-08-06T00:00:00.000Z"),
    updatedAt: new Date("2026-08-06T00:00:00.000Z"),
    device: {
      deviceName: "یخچال",
      brand: "سامسونگ",
      model: "X1",
      serialNumber: "SN1",
    },
    technician: null,
    ...overrides,
  };
}

const inventoryLine = {
  item_type: "inventory",
  item_id: 2,
  name: "خازن",
  description: null,
  quantity: 3,
  unit: null,
  unit_price: 10000,
  discount_type: null,
  discount_value: 0,
};

const serviceLine = {
  item_type: "service",
  item_id: 1,
  name: "دستمزد تعمیر",
  description: null,
  quantity: 1,
  unit: null,
  unit_price: 500000,
  discount_type: null,
  discount_value: 0,
};

const createBody = {
  device_id: 7,
  customer_name: null,
  customer_phone: null,
  invoice_date: undefined,
  due_date: null,
  discount_type: null,
  discount_value: 0,
  tax_rate: 0,
  warranty_months: 0,
  technician_id: null,
  notes: null,
  items: [inventoryLine],
};

/** The catalogue entry for inventoryLine's item. */
function catalogueItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 2,
    name: "خازن",
    unit: "عدد",
    sellPrice: decimal(25000),
    isFractional: false,
    ...overrides,
  };
}

/** The invoice as lockInvoice reads it. */
function lockedInvoice(overrides: Record<string, unknown> = {}) {
  db.__tx.$queryRaw.mockResolvedValue([{ id: 5 }]);
  db.__tx.repairInvoice.findFirst.mockResolvedValue({
    status: "draft",
    warehouseId: MAIN_WAREHOUSE,
    totalAmount: decimal(530000),
    paidAmount: decimal(0),
    items: [],
    ...overrides,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  db.__tx.workspace.update.mockResolvedValue({ repairSeq: 1 });
  db.__tx.repairInvoice.create.mockResolvedValue(invoiceRow());
  db.__tx.item.findMany.mockResolvedValue([catalogueItem()]);
  resolveWarehouse.mockResolvedValue(MAIN_WAREHOUSE);
  applyMovements.mockResolvedValue([]);
});

describe("repairInvoiceController.getAll", () => {
  it("scopes the listing to the caller's workspace", async () => {
    db.repairInvoice.count.mockResolvedValue(0);
    db.repairInvoice.findMany.mockResolvedValue([]);

    await controller.getAll(
      mockRequest({ query: { page: 1, limit: 10 } }),
      mockResponse(),
    );

    expect(db.repairInvoice.findMany.mock.calls[0][0].where).toEqual({
      workspaceId: WORKSPACE_ID,
    });
  });
});

describe("repairInvoiceController.getById", () => {
  it("only resolves catalogue details for inventory lines", async () => {
    // A service line's item_id points at the services table, so joining it to
    // items would attach an unrelated product's code and unit.
    db.repairInvoice.findFirst.mockResolvedValue({
      ...invoiceRow(),
      items: [
        {
          id: 1,
          invoiceId: 5,
          itemType: "service",
          itemId: 1,
          name: "دستمزد تعمیر",
          description: null,
          quantity: decimal(1),
          unit: "خدمت",
          unitPrice: decimal(500000),
          discountType: null,
          discountValue: decimal(0),
          discountAmount: decimal(0),
          totalPrice: decimal(500000),
          sortOrder: 0,
        },
      ],
      payments: [],
    });

    const res = mockResponse();
    await controller.getById(mockRequest({ params: { id: 5 } }), res);

    expect(db.item.findMany).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].items[0]).toMatchObject({
      item_type: "service",
      item_code: null,
      item_unit: null,
    });
  });

  it("attaches the code and unit of an inventory line's item", async () => {
    db.repairInvoice.findFirst.mockResolvedValue({
      ...invoiceRow(),
      items: [
        {
          id: 1,
          invoiceId: 5,
          itemType: "inventory",
          itemId: 2,
          name: "خازن",
          description: null,
          quantity: decimal(3),
          unit: "عدد",
          unitPrice: decimal(10000),
          discountType: null,
          discountValue: decimal(0),
          discountAmount: decimal(0),
          totalPrice: decimal(30000),
          sortOrder: 0,
        },
      ],
      payments: [],
    });
    db.item.findMany.mockResolvedValue([{ id: 2, code: "C-100", unit: "عدد" }]);

    const res = mockResponse();
    await controller.getById(mockRequest({ params: { id: 5 } }), res);

    expect(db.item.findMany.mock.calls[0][0].where).toMatchObject({
      workspaceId: WORKSPACE_ID,
    });
    expect(res.json.mock.calls[0][0].items[0]).toMatchObject({
      item_code: "C-100",
      item_unit: "عدد",
    });
  });

  it("returns 404 for an invoice in another workspace", async () => {
    db.repairInvoice.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.getById(mockRequest({ params: { id: 9 } }), res);

    expect(db.repairInvoice.findFirst.mock.calls[0][0].where).toEqual({
      id: 9,
      workspaceId: WORKSPACE_ID,
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("repairInvoiceController.create", () => {
  it("returns 404 for a device in another workspace", async () => {
    db.device.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.create(mockRequest({ body: createBody }, 3), res);

    expect(db.device.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 7,
      workspaceId: WORKSPACE_ID,
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(runInTx).not.toHaveBeenCalled();
  });

  it("copies the customer from the device when none was given", async () => {
    db.device.findFirst.mockResolvedValue({
      customerId: 2,
      customer: { name: "رضا", phone: "0912" },
    });

    await controller.create(
      mockRequest({ body: createBody }, 3),
      mockResponse(),
    );

    expect(db.__tx.repairInvoice.create.mock.calls[0][0].data).toMatchObject({
      workspaceId: WORKSPACE_ID,
      customerId: 2,
      customerName: "رضا",
      customerPhone: "0912",
      status: "draft",
    });
  });

  it("labels a device with no customer as a walk-in", async () => {
    db.device.findFirst.mockResolvedValue({
      customerId: null,
      customer: null,
    });

    await controller.create(
      mockRequest({ body: createBody }, 3),
      mockResponse(),
    );

    expect(
      db.__tx.repairInvoice.create.mock.calls[0][0].data.customerName,
    ).toBe("مشتری متفرقه");
  });

  it("takes its number from its own workspace's counter", async () => {
    db.device.findFirst.mockResolvedValue({ customerId: 2, customer: null });

    await controller.create(
      mockRequest({ body: createBody }, 3),
      mockResponse(),
    );

    // The prefix used to come from settings.invoicePrefix, which only repair
    // invoices ever read — purchase and sale had theirs hardcoded. All three
    // are fixed now: a number is accounting data whose job is to be unique
    // and traceable, while what a workshop wants to customise is how the
    // printed invoice looks (roadmap 9.5).
    expect(db.__tx.workspace.update).toHaveBeenCalledWith({
      where: { id: WORKSPACE_ID },
      data: { repairSeq: { increment: 1 } },
      select: { repairSeq: true },
    });
    expect(
      db.__tx.repairInvoice.create.mock.calls[0][0].data.invoiceNumber,
    ).toBe("REP-0001");
  });

  it("fills an inventory line's price from the item when none was sent", async () => {
    db.device.findFirst.mockResolvedValue({ customerId: 2, customer: null });

    await controller.create(
      mockRequest(
        {
          body: {
            ...createBody,
            items: [{ ...inventoryLine, unit_price: undefined }],
          },
        },
        3,
      ),
      mockResponse(),
    );

    expect(db.__tx.item.findMany.mock.calls[0][0].where).toMatchObject({
      id: { in: [2] },
      workspaceId: WORKSPACE_ID,
    });
    expect(
      db.__tx.repairInvoiceItem.create.mock.calls[0][0].data,
    ).toMatchObject({
      workspaceId: WORKSPACE_ID,
      unitPrice: 25000,
      unit: "عدد",
    });
  });

  it("leaves a service line's price alone", async () => {
    db.device.findFirst.mockResolvedValue({ customerId: 2, customer: null });

    await controller.create(
      mockRequest({ body: { ...createBody, items: [serviceLine] } }, 3),
      mockResponse(),
    );

    expect(db.__tx.item.findMany).not.toHaveBeenCalled();
    expect(
      db.__tx.repairInvoiceItem.create.mock.calls[0][0].data,
    ).toMatchObject({ unitPrice: 500000, itemType: "service" });
  });

  it("refuses an inventory line naming an item it cannot find", async () => {
    // Until 14.7 such a line was skipped here and skipped again at issue:
    // it printed on the invoice and took nothing from the shelf.
    db.device.findFirst.mockResolvedValue({ customerId: 2, customer: null });
    db.__tx.item.findMany.mockResolvedValue([]);

    const res = mockResponse();
    await controller.create(mockRequest({ body: createBody }, 3), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "کالا با شناسه 2 یافت نشد",
    });
    expect(db.__tx.repairInvoice.create).not.toHaveBeenCalled();
  });

  it("refuses a fraction of a whole-number part", async () => {
    db.device.findFirst.mockResolvedValue({ customerId: 2, customer: null });

    const res = mockResponse();
    await controller.create(
      mockRequest({
        body: { ...createBody, items: [{ ...inventoryLine, quantity: 0.5 }] },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain("«خازن»");
  });

  it("accepts a fraction of a fractional part", async () => {
    db.device.findFirst.mockResolvedValue({ customerId: 2, customer: null });
    db.__tx.item.findMany.mockResolvedValue([
      catalogueItem({ isFractional: true }),
    ]);

    const res = mockResponse();
    await controller.create(
      mockRequest({
        body: { ...createBody, items: [{ ...inventoryLine, quantity: 0.4 }] },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(
      db.__tx.repairInvoiceItem.create.mock.calls[0][0].data.quantity,
    ).toBe(0.4);
  });

  it("draws its parts from the warehouse it names", async () => {
    db.device.findFirst.mockResolvedValue({ customerId: 2, customer: null });
    resolveWarehouse.mockResolvedValue(9);

    await controller.create(
      mockRequest({ body: { ...createBody, warehouse_id: 9 } }),
      mockResponse(),
    );

    expect(resolveWarehouse).toHaveBeenCalledWith(
      expect.anything(),
      WORKSPACE_ID,
      9,
    );
    expect(db.__tx.repairInvoice.create.mock.calls[0][0].data.warehouseId).toBe(
      9,
    );
  });

  it("sets the warranty expiry from the invoice date", async () => {
    db.device.findFirst.mockResolvedValue({ customerId: 2, customer: null });

    await controller.create(
      mockRequest(
        {
          body: {
            ...createBody,
            invoice_date: new Date("2026-01-15T00:00:00.000Z"),
            warranty_months: 3,
          },
        },
        3,
      ),
      mockResponse(),
    );

    const until = db.__tx.repairInvoice.create.mock.calls[0][0].data
      .warrantyUntil as Date;
    expect(until.getMonth()).toBe(3); // April, three months on from January
  });

  it("leaves the warranty unset when no months were given", async () => {
    db.device.findFirst.mockResolvedValue({ customerId: 2, customer: null });

    await controller.create(
      mockRequest({ body: createBody }, 3),
      mockResponse(),
    );

    expect(
      db.__tx.repairInvoice.create.mock.calls[0][0].data.warrantyUntil,
    ).toBeNull();
  });

  it("does not touch stock — that waits until the invoice is issued", async () => {
    db.device.findFirst.mockResolvedValue({ customerId: 2, customer: null });

    await controller.create(
      mockRequest({ body: createBody }, 3),
      mockResponse(),
    );

    expect(applyMovements).not.toHaveBeenCalled();
  });
});

describe("repairInvoiceController.update", () => {
  it("returns 404 for an invoice in another workspace", async () => {
    db.__tx.$queryRaw.mockResolvedValue([]);

    const res = mockResponse();
    await controller.update(
      mockRequest({ params: { id: 9 }, body: createBody }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("refuses to edit anything past پیش‌فاکتور, under the lock", async () => {
    // Checked inside the transaction now: the invoice could otherwise be
    // issued between the check and the line rewrite.
    lockedInvoice({ status: "issued" });

    const res = mockResponse();
    await controller.update(
      mockRequest({ params: { id: 5 }, body: createBody }, 3),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "فقط پیش‌فاکتور قابل ویرایش است",
    });
    expect(db.__tx.repairInvoiceItem.deleteMany).not.toHaveBeenCalled();
  });

  it("replaces the lines of a پیش‌فاکتور without moving stock", async () => {
    lockedInvoice();

    const res = mockResponse();
    await controller.update(
      mockRequest({ params: { id: 5 }, body: createBody }, 3),
      res,
    );

    expect(db.__tx.repairInvoiceItem.deleteMany).toHaveBeenCalledWith({
      where: { invoiceId: 5, workspaceId: WORKSPACE_ID },
    });
    expect(applyMovements).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      message: "فاکتور با موفقیت ویرایش شد",
    });
  });

  it("moves the invoice to another warehouse only when told to", async () => {
    lockedInvoice();

    await controller.update(
      mockRequest({ params: { id: 5 }, body: createBody }),
      mockResponse(),
    );
    expect(
      db.__tx.repairInvoice.update.mock.calls[0][0].data,
    ).not.toHaveProperty("warehouseId");

    resolveWarehouse.mockResolvedValue(9);
    await controller.update(
      mockRequest({
        params: { id: 5 },
        body: { ...createBody, warehouse_id: 9 },
      }),
      mockResponse(),
    );
    expect(db.__tx.repairInvoice.update.mock.calls[1][0].data.warehouseId).toBe(
      9,
    );
  });
});

describe("repairInvoiceController.changeStatus", () => {
  const lines = [
    {
      id: 11,
      itemType: "inventory",
      itemId: 2,
      quantity: decimal(3),
      unitPrice: decimal(10000),
      unitCost: null,
    },
    {
      id: 12,
      itemType: "service",
      itemId: 1,
      quantity: decimal(1),
      unitPrice: decimal(500000),
      unitCost: null,
    },
  ];

  function change(status: string, actorId = 3) {
    const res = mockResponse();
    return controller
      .changeStatus(
        mockRequest({ params: { id: 5 }, body: { status } }, actorId),
        res,
      )
      .then(() => res);
  }

  it("returns 404 for an invoice in another workspace", async () => {
    db.__tx.$queryRaw.mockResolvedValue([]);

    const res = await change("issued");

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("refuses to change a cancelled invoice", async () => {
    lockedInvoice({ status: "cancelled" });

    const res = await change("issued");

    expect(res.status).toHaveBeenCalledWith(400);
    expect(applyMovements).not.toHaveBeenCalled();
  });

  it("refuses to send an issued invoice back to پیش‌فاکتور", async () => {
    // It used to go back and move nothing, so issuing it again took the
    // parts a second time.
    lockedInvoice({ status: "issued", items: lines });

    const res = await change("draft");

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain("ابطال");
    expect(db.__tx.repairInvoice.update).not.toHaveBeenCalled();
  });

  it("refuses to mark an invoice paid before it has been", async () => {
    lockedInvoice({
      status: "issued",
      totalAmount: decimal(200000),
      paidAmount: decimal(50000),
    });

    const res = await change("paid");

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "مبلغ پرداختی کافی نیست" });
  });

  it("takes only the inventory parts, exactly, when issuing", async () => {
    lockedInvoice({ items: lines });
    applyMovements.mockResolvedValue([{ unitCost: 8000 }]);

    await change("issued");

    const [, workspaceId, document, moved] = applyMovements.mock.calls[0];
    expect(workspaceId).toBe(WORKSPACE_ID);
    expect(document).toMatchObject({
      referenceType: "repair_invoice",
      referenceId: 5,
      actorId: 3,
    });
    expect(moved).toEqual([
      {
        itemId: 2,
        warehouseId: MAIN_WAREHOUSE,
        quantity: -3,
        type: "repair_use",
        unitPrice: 10000,
        note: "مصرف در فاکتور تعمیر",
      },
    ]);
  });

  it("moves a fractional part without rounding it", async () => {
    // 0.4 metres used to round to nothing.
    lockedInvoice({ items: [{ ...lines[0], quantity: decimal(0.4) }] });
    applyMovements.mockResolvedValue([{ unitCost: 50 }]);

    await change("issued");

    expect(applyMovements.mock.calls[0][3][0].quantity).toBe(-0.4);
  });

  it("records on each part the cost it left at", async () => {
    lockedInvoice({ items: lines });
    applyMovements.mockResolvedValue([{ unitCost: 8000 }]);

    await change("issued");

    expect(db.__tx.repairInvoiceItem.updateMany).toHaveBeenCalledTimes(1);
    expect(db.__tx.repairInvoiceItem.updateMany).toHaveBeenCalledWith({
      where: { id: 11, workspaceId: WORKSPACE_ID },
      data: { unitCost: 8000 },
    });
  });

  it("takes the parts when a پیش‌فاکتور goes straight to paid", async () => {
    // A zero-total invoice can; it used to be paid with its parts still on
    // the shelf, and deleting it later "returned" parts never taken.
    lockedInvoice({
      items: lines,
      totalAmount: decimal(0),
      paidAmount: decimal(0),
    });
    applyMovements.mockResolvedValue([{ unitCost: 8000 }]);

    const res = await change("paid");

    expect(res.status).not.toHaveBeenCalled();
    expect(applyMovements).toHaveBeenCalledTimes(1);
    expect(applyMovements.mock.calls[0][3][0].type).toBe("repair_use");
  });

  it("does not issue when the shelf is short, and says which part", async () => {
    lockedInvoice({ items: lines });
    applyMovements.mockRejectedValue(
      new InsufficientStockError(2, "خازن", 1, 3),
    );

    const res = await change("issued");

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain("«خازن»");
    expect(db.__tx.repairInvoice.update).not.toHaveBeenCalled();
  });

  it("puts the parts back at the cost they left at when cancelling", async () => {
    lockedInvoice({
      status: "issued",
      items: [{ ...lines[0], unitCost: decimal(8000) }, lines[1]],
    });

    await change("cancelled");

    expect(applyMovements.mock.calls[0][3]).toEqual([
      {
        itemId: 2,
        warehouseId: MAIN_WAREHOUSE,
        quantity: 3,
        type: "reversal",
        unitCost: 8000,
        unitPrice: 10000,
        note: "ابطال فاکتور تعمیر - برگشت موجودی",
      },
    ]);
  });

  it("moves no stock when cancelling a پیش‌فاکتور", async () => {
    lockedInvoice({ items: lines });

    await change("cancelled");

    expect(applyMovements).not.toHaveBeenCalled();
  });

  it("moves no stock when an issued invoice is marked paid", async () => {
    lockedInvoice({
      status: "issued",
      items: lines,
      paidAmount: decimal(530000),
    });

    await change("paid");

    expect(applyMovements).not.toHaveBeenCalled();
  });

  it("clears the payment obligation when cancelling", async () => {
    lockedInvoice({ status: "issued", items: lines });

    await change("cancelled");

    expect(db.__tx.repairInvoice.update.mock.calls[0][0].data).toEqual({
      status: "cancelled",
      paymentStatus: "cancelled",
    });
  });

  it("clears it for a part-paid invoice too, and keeps the amounts", async () => {
    lockedInvoice({
      status: "issued",
      items: lines,
      paidAmount: decimal(200000),
    });

    await change("cancelled");

    // Not «partial», which is what it used to stay. And neither amount is
    // touched: the 200,000 the customer handed over is still on the record.
    const { data } = db.__tx.repairInvoice.update.mock.calls[0][0];
    expect(data).toEqual({ status: "cancelled", paymentStatus: "cancelled" });
    expect(data).not.toHaveProperty("paidAmount");
    expect(data).not.toHaveProperty("totalAmount");
  });

  it("still marks a fully-paid invoice paid rather than cancelled", async () => {
    lockedInvoice({
      status: "issued",
      items: lines,
      paidAmount: decimal(530000),
    });

    await change("paid");

    expect(db.__tx.repairInvoice.update.mock.calls[0][0].data).toEqual({
      status: "paid",
      paymentStatus: "paid",
    });
  });
});

describe("repairInvoiceController.addPayment", () => {
  it("refuses a payment against a draft", async () => {
    db.repairInvoice.findFirst.mockResolvedValue({
      status: "draft",
      totalAmount: decimal(200000),
      paidAmount: decimal(0),
    });

    const res = mockResponse();
    await controller.addPayment(
      mockRequest(
        { params: { id: 5 }, body: { amount: 1000, payment_method: "cash" } },
        3,
      ),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "ابتدا باید فاکتور صادر شود",
    });
  });

  it("refuses to overpay", async () => {
    db.repairInvoice.findFirst.mockResolvedValue({
      status: "issued",
      totalAmount: decimal(200000),
      paidAmount: decimal(190000),
    });

    const res = mockResponse();
    await controller.addPayment(
      mockRequest(
        { params: { id: 5 }, body: { amount: 20000, payment_method: "cash" } },
        3,
      ),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(runInTx).not.toHaveBeenCalled();
  });

  it("marks a part payment partial and leaves the status alone", async () => {
    db.repairInvoice.findFirst.mockResolvedValue({
      status: "issued",
      totalAmount: decimal(200000),
      paidAmount: decimal(0),
    });

    const res = mockResponse();
    await controller.addPayment(
      mockRequest(
        { params: { id: 5 }, body: { amount: 50000, payment_method: "cash" } },
        3,
      ),
      res,
    );

    expect(
      db.__tx.repairInvoicePayment.create.mock.calls[0][0].data,
    ).toMatchObject({ workspaceId: WORKSPACE_ID, invoiceId: 5 });
    expect(db.__tx.repairInvoice.update.mock.calls[0][0].data).toEqual({
      paidAmount: 50000,
      paymentStatus: "partial",
    });
    expect(res.json).toHaveBeenCalledWith({
      message: "پرداخت با موفقیت ثبت شد",
      paid_amount: 50000,
      payment_status: "partial",
      remaining: 150000,
    });
  });

  it("closes the invoice once it is settled in full", async () => {
    db.repairInvoice.findFirst.mockResolvedValue({
      status: "issued",
      totalAmount: decimal(200000),
      paidAmount: decimal(150000),
    });

    await controller.addPayment(
      mockRequest(
        { params: { id: 5 }, body: { amount: 50000, payment_method: "cash" } },
        3,
      ),
      mockResponse(),
    );

    expect(db.__tx.repairInvoice.update.mock.calls[0][0].data).toEqual({
      paidAmount: 200000,
      paymentStatus: "paid",
      status: "paid",
    });
  });
});

describe("repairInvoiceController.remove", () => {
  const issuedLine = {
    id: 11,
    itemType: "inventory",
    itemId: 2,
    quantity: decimal(3),
    unitPrice: decimal(10000),
    unitCost: decimal(8000),
  };

  it("returns 404 for an invoice in another workspace", async () => {
    db.__tx.$queryRaw.mockResolvedValue([]);

    const res = mockResponse();
    await controller.remove(mockRequest({ params: { id: 9 } }, 3), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.__tx.repairInvoice.delete).not.toHaveBeenCalled();
  });

  it("returns the parts of an issued invoice before deleting it", async () => {
    lockedInvoice({ status: "issued", items: [issuedLine] });

    await controller.remove(
      mockRequest({ params: { id: 5 } }, 3),
      mockResponse(),
    );

    expect(applyMovements.mock.calls[0][3]).toEqual([
      expect.objectContaining({
        itemId: 2,
        quantity: 3,
        type: "reversal",
        unitCost: 8000,
      }),
    ]);
    expect(db.__tx.repairInvoice.delete).toHaveBeenCalledWith({
      where: { id: 5 },
    });
  });

  it("returns the parts of a paid invoice too", async () => {
    lockedInvoice({ status: "paid", items: [issuedLine] });

    await controller.remove(mockRequest({ params: { id: 5 } }), mockResponse());

    expect(applyMovements).toHaveBeenCalledTimes(1);
  });

  it.each(["draft", "cancelled"])(
    "moves no stock when deleting a %s invoice",
    async (status) => {
      // A پیش‌فاکتور never took its parts; a cancelled invoice already gave
      // them back.
      lockedInvoice({ status, items: [issuedLine] });

      await controller.remove(
        mockRequest({ params: { id: 5 } }, 3),
        mockResponse(),
      );

      expect(applyMovements).not.toHaveBeenCalled();
      expect(db.__tx.repairInvoice.delete).toHaveBeenCalled();
    },
  );
});
