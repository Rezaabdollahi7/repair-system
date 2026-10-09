import { Request, Response } from "express";
import * as controller from "../controllers/customerController";
import prisma from "../lib/prisma";

jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: {
    customer: {
      count: jest.fn(),
      findMany: jest.fn(),
      // findFirst rather than findUnique: the controller pairs id with
      // workspaceId now, which findUnique can't express.
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    device: {
      findMany: jest.fn(),
    },
    repairInvoice: { findMany: jest.fn() },
    saleInvoice: { findMany: jest.fn() },
  },
}));

const db = prisma as unknown as {
  customer: Record<string, jest.Mock>;
  device: Record<string, jest.Mock>;
  repairInvoice: Record<string, jest.Mock>;
  saleInvoice: Record<string, jest.Mock>;
};

function mockResponse() {
  const res = {} as Response & { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// Every tenant-scoped handler reads workspaceIdOf(req), which throws when
// the token carried no workspace — so the mock has to supply one.
const WORKSPACE_ID = 1;

function mockRequest(valid: Record<string, unknown> = {}) {
  return {
    valid: { body: undefined, params: undefined, query: undefined, ...valid },
    user: { id: 3, workspaceId: WORKSPACE_ID, role: "super_admin" },
  } as unknown as Request;
}

describe("customerController.getAll", () => {
  it("returns paginated customers with a device count", async () => {
    db.customer.count.mockResolvedValue(1);
    db.customer.findMany.mockResolvedValue([
      { id: 7, name: "رضا", phone: "09120000000", _count: { devices: 3 } },
    ]);

    const res = mockResponse();
    await controller.getAll(
      mockRequest({ query: { page: 1, limit: 10 } }),
      res,
    );

    expect(res.json).toHaveBeenCalledWith({
      data: [{ id: 7, name: "رضا", phone: "09120000000", device_count: 3 }],
      total: 1,
      page: 1,
      totalPages: 1,
    });
  });

  it("searches name and phone case-insensitively", async () => {
    db.customer.count.mockResolvedValue(0);
    db.customer.findMany.mockResolvedValue([]);

    await controller.getAll(
      mockRequest({ query: { page: 1, limit: 10, search: "رضا" } }),
      mockResponse(),
    );

    expect(db.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: WORKSPACE_ID,
          OR: [
            { name: { contains: "رضا", mode: "insensitive" } },
            { phone: { contains: "رضا", mode: "insensitive" } },
          ],
        },
      }),
    );
  });

  it("offsets by page", async () => {
    db.customer.count.mockResolvedValue(0);
    db.customer.findMany.mockResolvedValue([]);

    await controller.getAll(
      mockRequest({ query: { page: 3, limit: 10 } }),
      mockResponse(),
    );

    expect(db.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });
});

describe("customerController.getOne", () => {
  it("returns 404 when the customer does not exist", async () => {
    db.customer.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.getOne(mockRequest({ params: { id: 9 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "مشتری یافت نشد" });
  });

  it("serializes the customer into snake_case", async () => {
    db.customer.findFirst.mockResolvedValue({
      id: 1,
      name: "رضا",
      phone: null,
      createdAt: new Date("2026-01-15T10:30:00.000Z"),
    });

    const res = mockResponse();
    await controller.getOne(mockRequest({ params: { id: 1 } }), res);

    expect(res.json).toHaveBeenCalledWith({
      id: 1,
      name: "رضا",
      phone: null,
      created_at: "2026-01-15T10:30:00.000Z",
    });
  });
});

describe("customerController.create", () => {
  it("persists the validated body and answers 201", async () => {
    db.customer.create.mockResolvedValue({
      id: 1,
      name: "رضا",
      phone: null,
      createdAt: new Date("2026-01-15T10:30:00.000Z"),
    });

    const res = mockResponse();
    await controller.create(
      mockRequest({ body: { name: "رضا", phone: null } }),
      res,
    );

    expect(db.customer.create).toHaveBeenCalledWith({
      data: { name: "رضا", phone: null, workspaceId: WORKSPACE_ID },
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe("customerController.update", () => {
  it("returns 404 without attempting the update", async () => {
    db.customer.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.update(
      mockRequest({ params: { id: 9 }, body: { name: "رضا", phone: null } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.customer.update).not.toHaveBeenCalled();
  });
});

describe("customerController.remove", () => {
  it("reports an id that no longer exists as 404", async () => {
    db.customer.deleteMany.mockResolvedValue({ count: 0 });

    const res = mockResponse();
    await controller.remove(mockRequest({ params: { id: 99 } }), res);

    expect(db.customer.deleteMany).toHaveBeenCalledWith({
      where: { id: 99, workspaceId: WORKSPACE_ID },
    });
    // Was "success even for a missing id", matching the old sql.js handler.
    // The isolation tests showed devices and items answering 404 for the same
    // case, and one operation reporting three different ways is a frontend
    // bug waiting to happen.
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "مشتری یافت نشد" });
  });
});

describe("customerController.getOverview", () => {
  function decimal(value: number) {
    return { toNumber: () => value };
  }

  function customerRow() {
    return {
      id: 5,
      name: "زهرا کریمی",
      phone: "09121234567",
      notes: null,
      createdAt: new Date("2026-01-05T00:00:00.000Z"),
    };
  }

  function deviceRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 3,
      deviceName: "گوشی موبایل",
      brand: "سامسونگ",
      model: "Galaxy A54",
      serialNumber: null,
      status: "repairing",
      entryDate: new Date("2026-09-02T00:00:00.000Z"),
      exitDate: null,
      createdAt: new Date("2026-09-02T00:00:00.000Z"),
      assignments: [],
      ...overrides,
    };
  }

  function repairInvoiceRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 1,
      invoiceNumber: "REP-0042",
      invoiceDate: new Date("2026-09-03T00:00:00.000Z"),
      totalAmount: decimal(5_000_000),
      paidAmount: decimal(2_000_000),
      paymentStatus: "partial",
      deviceId: 3,
      payments: [],
      ...overrides,
    };
  }

  function setup(
    devices: unknown[] = [],
    repairs: unknown[] = [],
    sales: unknown[] = [],
  ) {
    db.customer.findFirst.mockResolvedValue(customerRow());
    db.device.findMany.mockResolvedValue(devices);
    db.repairInvoice.findMany.mockResolvedValue(repairs);
    db.saleInvoice.findMany.mockResolvedValue(sales);
  }

  it("returns 404 for a customer in another workspace", async () => {
    db.customer.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.getOverview(mockRequest({ params: { id: 9 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    // Nothing else is read once the customer is missing: a stray device
    // query would still be workspace-scoped, but it would be work done for
    // an answer already decided.
    expect(db.device.findMany).not.toHaveBeenCalled();
  });

  it("scopes every read to the workspace", async () => {
    setup([deviceRow()], [repairInvoiceRow()], []);

    await controller.getOverview(
      mockRequest({ params: { id: 5 } }),
      mockResponse(),
    );

    for (const call of [
      db.device.findMany.mock.calls[0][0],
      db.repairInvoice.findMany.mock.calls[0][0],
      db.saleInvoice.findMany.mock.calls[0][0],
    ]) {
      expect(call.where).toMatchObject({
        customerId: 5,
        workspaceId: WORKSPACE_ID,
      });
    }
  });

  it("counts a device on the shelf as active, and as a successful repair", async () => {
    // `repaired` is finished work that has not left the building, so it is
    // both — the two counts answer different questions.
    setup([
      deviceRow({ id: 1, status: "repaired" }),
      deviceRow({ id: 2, status: "delivered" }),
      deviceRow({ id: 3, status: "unrepairable" }),
      deviceRow({ id: 4, status: "pending" }),
    ]);

    const res = mockResponse();
    await controller.getOverview(mockRequest({ params: { id: 5 } }), res);

    expect(res.json.mock.calls[0][0].summary).toMatchObject({
      total_devices: 4,
      active_devices: 2,
      successful_repairs: 2,
      failed_repairs: 1,
    });
  });

  it("leaves a cancelled invoice out of the total paid", async () => {
    // A cancelled invoice is neither money owed nor money taken, which is
    // how the invoice lists already treat it.
    setup(
      [],
      [
        repairInvoiceRow({ id: 1, paidAmount: decimal(2_000_000) }),
        repairInvoiceRow({
          id: 2,
          paidAmount: decimal(9_000_000),
          paymentStatus: "cancelled",
        }),
      ],
      [
        {
          id: 7,
          invoiceNumber: "SAL-0009",
          invoiceDate: new Date("2026-08-01T00:00:00.000Z"),
          totalAmount: decimal(1_000_000),
          paidAmount: decimal(1_000_000),
          paymentStatus: "paid",
          deviceId: null,
        },
      ],
    );

    const res = mockResponse();
    await controller.getOverview(mockRequest({ params: { id: 5 } }), res);

    expect(res.json.mock.calls[0][0].summary.total_paid).toBe(3_000_000);
  });

  it("reads the last visit from the most recent intake", async () => {
    setup([
      deviceRow({ id: 1, entryDate: new Date("2026-03-01T00:00:00.000Z") }),
      deviceRow({ id: 2, entryDate: new Date("2026-09-02T00:00:00.000Z") }),
      deviceRow({ id: 3, entryDate: new Date("2026-06-15T00:00:00.000Z") }),
    ]);

    const res = mockResponse();
    await controller.getOverview(mockRequest({ params: { id: 5 } }), res);

    expect(res.json.mock.calls[0][0].summary.last_visit).toBe(
      "2026-09-02T00:00:00.000Z",
    );
  });

  it("falls back to the row's creation date for a device with no intake", async () => {
    setup([
      deviceRow({
        entryDate: null,
        createdAt: new Date("2026-07-07T00:00:00.000Z"),
      }),
    ]);

    const res = mockResponse();
    await controller.getOverview(mockRequest({ params: { id: 5 } }), res);

    const body = res.json.mock.calls[0][0];
    expect(body.summary.last_visit).toBe("2026-07-07T00:00:00.000Z");
    expect(body.timeline[0].events[0]).toMatchObject({
      type: "registered",
      date: "2026-07-07T00:00:00.000Z",
    });
  });

  it("builds the timeline in date order, whatever order the rows arrived in", async () => {
    setup(
      [
        deviceRow({
          entryDate: new Date("2026-09-01T00:00:00.000Z"),
          exitDate: new Date("2026-09-06T00:00:00.000Z"),
        }),
      ],
      [
        repairInvoiceRow({
          invoiceDate: new Date("2026-09-04T00:00:00.000Z"),
          payments: [
            {
              amount: decimal(2_000_000),
              paymentDate: new Date("2026-09-05T00:00:00.000Z"),
            },
          ],
        }),
      ],
    );

    const res = mockResponse();
    await controller.getOverview(mockRequest({ params: { id: 5 } }), res);

    expect(
      res.json.mock.calls[0][0].timeline[0].events.map(
        (event: { type: string }) => event.type,
      ),
    ).toEqual(["registered", "invoiced", "paid", "delivered"]);
  });

  it("keeps a device's own invoices out of another device's timeline", async () => {
    setup(
      [deviceRow({ id: 1 }), deviceRow({ id: 2 })],
      [
        repairInvoiceRow({ id: 10, deviceId: 1 }),
        repairInvoiceRow({ id: 11, deviceId: 2, invoiceNumber: "REP-0043" }),
      ],
    );

    const res = mockResponse();
    await controller.getOverview(mockRequest({ params: { id: 5 } }), res);

    const [first, second] = res.json.mock.calls[0][0].timeline;
    expect(
      first.events.filter((e: { type: string }) => e.type === "invoiced"),
    ).toHaveLength(1);
    expect(
      second.events.find((e: { type: string }) => e.type === "invoiced")
        .invoice_number,
    ).toBe("REP-0043");
  });

  it("merges repair and sale invoices into one list, newest first", async () => {
    setup(
      [],
      [
        repairInvoiceRow({
          invoiceDate: new Date("2026-05-01T00:00:00.000Z"),
        }),
      ],
      [
        {
          id: 7,
          invoiceNumber: "SAL-0009",
          invoiceDate: new Date("2026-08-01T00:00:00.000Z"),
          totalAmount: decimal(1_000_000),
          paidAmount: decimal(0),
          paymentStatus: "pending",
          deviceId: null,
        },
      ],
    );

    const res = mockResponse();
    await controller.getOverview(mockRequest({ params: { id: 5 } }), res);

    expect(
      res.json.mock.calls[0][0].invoices.map(
        (invoice: { kind: string }) => invoice.kind,
      ),
    ).toEqual(["sale", "repair"]);
  });
});

describe("customerController.updateNotes", () => {
  it("writes only within the workspace", async () => {
    db.customer.updateMany.mockResolvedValue({ count: 1 });

    const res = mockResponse();
    await controller.updateNotes(
      mockRequest({ params: { id: 5 }, body: { notes: "دیر پرداخت می‌کند" } }),
      res,
    );

    // updateMany, not update: `update` matches on the primary key alone and
    // would reach another workspace's row.
    expect(db.customer.updateMany).toHaveBeenCalledWith({
      where: { id: 5, workspaceId: WORKSPACE_ID },
      data: { notes: "دیر پرداخت می‌کند" },
    });
    expect(res.json).toHaveBeenCalledWith({
      message: "یادداشت ذخیره شد",
      notes: "دیر پرداخت می‌کند",
    });
  });

  it("reports a customer in another workspace as 404 rather than silently writing nothing", async () => {
    db.customer.updateMany.mockResolvedValue({ count: 0 });

    const res = mockResponse();
    await controller.updateNotes(
      mockRequest({ params: { id: 99 }, body: { notes: "x" } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
