import { Request, Response } from "express";
import * as controller from "../controllers/repairInvoiceController";
import prisma from "../lib/prisma";

jest.mock("../lib/prisma", () => {
  const tx = {
    settings: { findUnique: jest.fn() },
    repairInvoice: {
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    repairInvoiceItem: { create: jest.fn(), deleteMany: jest.fn() },
    repairInvoicePayment: { create: jest.fn() },
    item: { findUnique: jest.fn(), update: jest.fn() },
    inventoryTransaction: { create: jest.fn() },
  };

  return {
    __esModule: true,
    default: {
      repairInvoice: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      device: { findUnique: jest.fn() },
      item: { findMany: jest.fn() },
      $transaction: jest.fn((callback: (client: unknown) => unknown) =>
        callback(tx),
      ),
      __tx: tx,
    },
  };
});

const db = prisma as unknown as {
  repairInvoice: Record<string, jest.Mock>;
  device: Record<string, jest.Mock>;
  item: Record<string, jest.Mock>;
  $transaction: jest.Mock;
  __tx: {
    settings: Record<string, jest.Mock>;
    repairInvoice: Record<string, jest.Mock>;
    repairInvoiceItem: Record<string, jest.Mock>;
    repairInvoicePayment: Record<string, jest.Mock>;
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

function mockRequest(valid: Record<string, unknown> = {}, actorId?: number) {
  return {
    valid: { body: undefined, params: undefined, query: undefined, ...valid },
    user: actorId === undefined ? undefined : { id: actorId },
  } as unknown as Request;
}

function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    invoiceNumber: "INV-20260806-0001",
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

beforeEach(() => {
  jest.clearAllMocks();
  db.__tx.settings.findUnique.mockResolvedValue({ invoicePrefix: "INV-" });
  db.__tx.repairInvoice.count.mockResolvedValue(0);
  db.__tx.repairInvoice.create.mockResolvedValue(invoiceRow());
});

describe("repairInvoiceController.getById", () => {
  it("only resolves catalogue details for inventory lines", async () => {
    // A service line's item_id points at the services table, so joining it to
    // items would attach an unrelated product's code and unit.
    db.repairInvoice.findUnique.mockResolvedValue({
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
    db.repairInvoice.findUnique.mockResolvedValue({
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

    expect(res.json.mock.calls[0][0].items[0]).toMatchObject({
      item_code: "C-100",
      item_unit: "عدد",
    });
  });

  it("returns 404 for an unknown invoice", async () => {
    db.repairInvoice.findUnique.mockResolvedValue(null);

    const res = mockResponse();
    await controller.getById(mockRequest({ params: { id: 9 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("repairInvoiceController.create", () => {
  it("returns 404 for an unknown device", async () => {
    db.device.findUnique.mockResolvedValue(null);

    const res = mockResponse();
    await controller.create(mockRequest({ body: createBody }, 3), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("copies the customer from the device when none was given", async () => {
    db.device.findUnique.mockResolvedValue({
      customerId: 2,
      customer: { name: "رضا", phone: "0912" },
    });

    await controller.create(
      mockRequest({ body: createBody }, 3),
      mockResponse(),
    );

    expect(db.__tx.repairInvoice.create.mock.calls[0][0].data).toMatchObject({
      customerId: 2,
      customerName: "رضا",
      customerPhone: "0912",
      status: "draft",
    });
  });

  it("labels a device with no customer as a walk-in", async () => {
    db.device.findUnique.mockResolvedValue({
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

  it("takes the invoice prefix from settings", async () => {
    db.device.findUnique.mockResolvedValue({ customerId: 2, customer: null });
    db.__tx.settings.findUnique.mockResolvedValue({ invoicePrefix: "REP-" });

    await controller.create(
      mockRequest({ body: createBody }, 3),
      mockResponse(),
    );

    expect(
      db.__tx.repairInvoice.create.mock.calls[0][0].data.invoiceNumber,
    ).toMatch(/^REP-\d{8}-0001$/);
  });

  it("fills an inventory line's price from the item when none was sent", async () => {
    db.device.findUnique.mockResolvedValue({ customerId: 2, customer: null });
    db.__tx.item.findUnique.mockResolvedValue({
      sellPrice: decimal(25000),
      unit: "عدد",
    });

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

    expect(
      db.__tx.repairInvoiceItem.create.mock.calls[0][0].data,
    ).toMatchObject({ unitPrice: 25000, unit: "عدد" });
  });

  it("leaves a service line's price alone", async () => {
    db.device.findUnique.mockResolvedValue({ customerId: 2, customer: null });

    await controller.create(
      mockRequest({ body: { ...createBody, items: [serviceLine] } }, 3),
      mockResponse(),
    );

    expect(db.__tx.item.findUnique).not.toHaveBeenCalled();
    expect(
      db.__tx.repairInvoiceItem.create.mock.calls[0][0].data,
    ).toMatchObject({ unitPrice: 500000, itemType: "service" });
  });

  it("sets the warranty expiry from the invoice date", async () => {
    db.device.findUnique.mockResolvedValue({ customerId: 2, customer: null });

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
    db.device.findUnique.mockResolvedValue({ customerId: 2, customer: null });

    await controller.create(
      mockRequest({ body: createBody }, 3),
      mockResponse(),
    );

    expect(
      db.__tx.repairInvoice.create.mock.calls[0][0].data.warrantyUntil,
    ).toBeNull();
  });

  it("does not touch stock — that waits until the invoice is issued", async () => {
    db.device.findUnique.mockResolvedValue({ customerId: 2, customer: null });

    await controller.create(
      mockRequest({ body: createBody }, 3),
      mockResponse(),
    );

    expect(db.__tx.item.update).not.toHaveBeenCalled();
    expect(db.__tx.inventoryTransaction.create).not.toHaveBeenCalled();
  });
});

describe("repairInvoiceController.update", () => {
  it("refuses to edit anything past draft", async () => {
    db.repairInvoice.findUnique.mockResolvedValue({ status: "issued" });

    const res = mockResponse();
    await controller.update(
      mockRequest({ params: { id: 5 }, body: createBody }, 3),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "فقط فاکتورهای پیش‌نویس قابل ویرایش هستند",
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("replaces the lines of a draft", async () => {
    db.repairInvoice.findUnique.mockResolvedValue({ status: "draft" });

    const res = mockResponse();
    await controller.update(
      mockRequest({ params: { id: 5 }, body: createBody }, 3),
      res,
    );

    expect(db.__tx.repairInvoiceItem.deleteMany).toHaveBeenCalledWith({
      where: { invoiceId: 5 },
    });
    expect(res.json).toHaveBeenCalledWith({
      message: "فاکتور با موفقیت ویرایش شد",
    });
  });
});

describe("repairInvoiceController.changeStatus", () => {
  const lines = [
    {
      itemType: "inventory",
      itemId: 2,
      quantity: decimal(3),
      unitPrice: decimal(10000),
    },
    {
      itemType: "service",
      itemId: 1,
      quantity: decimal(1),
      unitPrice: decimal(500000),
    },
  ];

  it("refuses to change a cancelled invoice", async () => {
    db.repairInvoice.findUnique.mockResolvedValue({
      status: "cancelled",
      totalAmount: decimal(0),
      paidAmount: decimal(0),
      items: [],
    });

    const res = mockResponse();
    await controller.changeStatus(
      mockRequest({ params: { id: 5 }, body: { status: "issued" } }, 3),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("refuses to mark an invoice paid before it has been", async () => {
    db.repairInvoice.findUnique.mockResolvedValue({
      status: "issued",
      totalAmount: decimal(200000),
      paidAmount: decimal(50000),
      items: [],
    });

    const res = mockResponse();
    await controller.changeStatus(
      mockRequest({ params: { id: 5 }, body: { status: "paid" } }, 3),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "مبلغ پرداختی کافی نیست" });
  });

  it("takes only the inventory parts off the shelf when issuing", async () => {
    db.repairInvoice.findUnique.mockResolvedValue({
      status: "draft",
      totalAmount: decimal(530000),
      paidAmount: decimal(0),
      items: lines,
    });
    db.__tx.item.findUnique.mockResolvedValue({ currentStock: 10 });

    await controller.changeStatus(
      mockRequest({ params: { id: 5 }, body: { status: "issued" } }, 3),
      mockResponse(),
    );

    expect(db.__tx.item.update).toHaveBeenCalledTimes(1);
    expect(db.__tx.item.update.mock.calls[0][0].data).toEqual({
      currentStock: 7,
    });
    expect(
      db.__tx.inventoryTransaction.create.mock.calls[0][0].data,
    ).toMatchObject({
      type: "sale",
      quantity: -3,
      referenceId: 5,
      referenceType: "repair_invoice",
      createdBy: 3,
    });
  });

  it("puts the parts back when cancelling an issued invoice", async () => {
    db.repairInvoice.findUnique.mockResolvedValue({
      status: "issued",
      totalAmount: decimal(530000),
      paidAmount: decimal(0),
      items: lines,
    });
    db.__tx.item.findUnique.mockResolvedValue({ currentStock: 7 });

    await controller.changeStatus(
      mockRequest({ params: { id: 5 }, body: { status: "cancelled" } }, 3),
      mockResponse(),
    );

    expect(db.__tx.item.update.mock.calls[0][0].data).toEqual({
      currentStock: 10,
    });
    expect(
      db.__tx.inventoryTransaction.create.mock.calls[0][0].data,
    ).toMatchObject({ type: "adjustment", quantity: 3 });
  });

  it("moves no stock when cancelling a draft", async () => {
    db.repairInvoice.findUnique.mockResolvedValue({
      status: "draft",
      totalAmount: decimal(530000),
      paidAmount: decimal(0),
      items: lines,
    });

    await controller.changeStatus(
      mockRequest({ params: { id: 5 }, body: { status: "cancelled" } }, 3),
      mockResponse(),
    );

    expect(db.__tx.item.update).not.toHaveBeenCalled();
  });
});

describe("repairInvoiceController.addPayment", () => {
  it("refuses a payment against a draft", async () => {
    db.repairInvoice.findUnique.mockResolvedValue({
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
    db.repairInvoice.findUnique.mockResolvedValue({
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
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("marks a part payment partial and leaves the status alone", async () => {
    db.repairInvoice.findUnique.mockResolvedValue({
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
    db.repairInvoice.findUnique.mockResolvedValue({
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
  it("returns 404 for an unknown invoice", async () => {
    db.repairInvoice.findUnique.mockResolvedValue(null);

    const res = mockResponse();
    await controller.remove(mockRequest({ params: { id: 9 } }, 3), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("returns the parts of an issued invoice before deleting it", async () => {
    db.repairInvoice.findUnique.mockResolvedValue({
      status: "issued",
      items: [
        {
          itemType: "inventory",
          itemId: 2,
          quantity: decimal(3),
          unitPrice: decimal(10000),
        },
      ],
    });
    db.__tx.item.findUnique.mockResolvedValue({ currentStock: 7 });

    await controller.remove(
      mockRequest({ params: { id: 5 } }, 3),
      mockResponse(),
    );

    expect(db.__tx.item.update.mock.calls[0][0].data).toEqual({
      currentStock: 10,
    });
    expect(db.__tx.repairInvoice.delete).toHaveBeenCalledWith({
      where: { id: 5 },
    });
  });

  it("moves no stock when deleting a draft", async () => {
    db.repairInvoice.findUnique.mockResolvedValue({
      status: "draft",
      items: [
        {
          itemType: "inventory",
          itemId: 2,
          quantity: decimal(3),
          unitPrice: decimal(10000),
        },
      ],
    });

    await controller.remove(
      mockRequest({ params: { id: 5 } }, 3),
      mockResponse(),
    );

    expect(db.__tx.item.update).not.toHaveBeenCalled();
    expect(db.__tx.repairInvoice.delete).toHaveBeenCalled();
  });
});
