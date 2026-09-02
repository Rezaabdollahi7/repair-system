import { Request, Response } from "express";
import * as controller from "../controllers/deviceController";
import prisma from "../lib/prisma";
import { deleteDeviceImages } from "../controllers/imageController";

jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: {
    device: {
      count: jest.fn(),
      findMany: jest.fn(),
      // findFirst rather than findUnique: the controller pairs id with
      // workspaceId now, which findUnique can't express.
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock("../controllers/imageController", () => ({
  deleteDeviceImages: jest.fn(),
}));

const db = prisma as unknown as { device: Record<string, jest.Mock> };

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

function deviceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    customerId: 4,
    deviceName: "یخچال",
    brand: "سامسونگ",
    model: "X1",
    serialNumber: "SN1",
    entryDate: new Date("2026-01-01T00:00:00.000Z"),
    exitDate: null,
    status: "pending",
    description: null,
    needsInvoice: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    customer: { name: "رضا", phone: "0912" },
    assignments: [{ personnel: { id: 2, fullName: "علی", username: "ali" } }],
    saleInvoices: [],
    _count: { saleInvoices: 0 },
    ...overrides,
  };
}

const baseQuery = { page: 1, limit: 10 };

beforeEach(() => {
  jest.clearAllMocks();
});

describe("deviceController.getAll", () => {
  it("flattens the customer relation and lists assignees", async () => {
    db.device.count.mockResolvedValue(1);
    db.device.findMany.mockResolvedValue([deviceRow()]);

    const res = mockResponse();
    await controller.getAll(mockRequest({ query: baseQuery }), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.data[0]).toMatchObject({
      id: 1,
      device_name: "یخچال",
      customer_name: "رضا",
      customer_phone: "0912",
      needs_invoice: true,
      invoice_status: null,
      sale_invoice_id: null,
      invoice_count: 0,
      assignees: [{ id: 2, name: "علی", username: "ali" }],
    });
  });

  it("derives invoice fields from the most recent sale invoice", async () => {
    db.device.count.mockResolvedValue(1);
    db.device.findMany.mockResolvedValue([
      deviceRow({
        saleInvoices: [{ id: 30, paymentStatus: "paid" }],
        _count: { saleInvoices: 1 },
      }),
    ]);

    const res = mockResponse();
    await controller.getAll(mockRequest({ query: baseQuery }), res);

    expect(res.json.mock.calls[0][0].data[0]).toMatchObject({
      invoice_status: "paid",
      sale_invoice_id: 30,
      invoice_count: 1,
    });
  });

  it("matches an id exactly when the search term is numeric", async () => {
    db.device.count.mockResolvedValue(0);
    db.device.findMany.mockResolvedValue([]);

    await controller.getAll(
      mockRequest({ query: { ...baseQuery, search: "12" } }),
      mockResponse(),
    );

    // AND[0] is the workspace condition now; the search alternatives follow.
    const where = db.device.findMany.mock.calls[0][0].where;
    expect(where.AND[1].OR).toContainEqual({ id: 12 });
  });

  it("omits the id filter for a non-numeric search term", async () => {
    db.device.count.mockResolvedValue(0);
    db.device.findMany.mockResolvedValue([]);

    await controller.getAll(
      mockRequest({ query: { ...baseQuery, search: "یخچال" } }),
      mockResponse(),
    );

    const alternatives = db.device.findMany.mock.calls[0][0].where.AND[1].OR;
    expect(alternatives.some((f: object) => "id" in f)).toBe(false);
  });

  it("filters by several statuses at once", async () => {
    db.device.count.mockResolvedValue(0);
    db.device.findMany.mockResolvedValue([]);

    await controller.getAll(
      mockRequest({
        query: { ...baseQuery, status: ["repaired", "delivered"] },
      }),
      mockResponse(),
    );

    expect(db.device.findMany.mock.calls[0][0].where.AND).toContainEqual({
      status: { in: ["repaired", "delivered"] },
    });
  });

  it("translates no_invoice into needs-invoice-with-none-attached", async () => {
    db.device.count.mockResolvedValue(0);
    db.device.findMany.mockResolvedValue([]);

    await controller.getAll(
      mockRequest({ query: { ...baseQuery, invoice_status: ["no_invoice"] } }),
      mockResponse(),
    );

    const where = db.device.findMany.mock.calls[0][0].where;
    expect(where.AND[1].OR).toEqual([
      { needsInvoice: true, saleInvoices: { none: {} } },
    ]);
  });

  it("combines several invoice statuses as alternatives", async () => {
    db.device.count.mockResolvedValue(0);
    db.device.findMany.mockResolvedValue([]);

    await controller.getAll(
      mockRequest({
        query: { ...baseQuery, invoice_status: ["paid", "not_needed"] },
      }),
      mockResponse(),
    );

    expect(db.device.findMany.mock.calls[0][0].where.AND[1].OR).toEqual([
      { saleInvoices: { some: { paymentStatus: "paid" } } },
      { needsInvoice: false },
    ]);
  });

  it("filters by assigned personnel", async () => {
    db.device.count.mockResolvedValue(0);
    db.device.findMany.mockResolvedValue([]);

    await controller.getAll(
      mockRequest({ query: { ...baseQuery, personnel_ids: [2, 5] } }),
      mockResponse(),
    );

    expect(db.device.findMany.mock.calls[0][0].where.AND).toContainEqual({
      assignments: { some: { personnelId: { in: [2, 5] } } },
    });
  });

  it("fetches assignees in the same query rather than one per device", async () => {
    db.device.count.mockResolvedValue(0);
    db.device.findMany.mockResolvedValue([]);

    await controller.getAll(mockRequest({ query: baseQuery }), mockResponse());

    expect(db.device.findMany).toHaveBeenCalledTimes(1);
    expect(db.device.findMany.mock.calls[0][0].include).toHaveProperty(
      "assignments",
    );
  });

  it("scopes every list to the caller's workspace", async () => {
    db.device.count.mockResolvedValue(0);
    db.device.findMany.mockResolvedValue([]);

    await controller.getAll(mockRequest({ query: baseQuery }), mockResponse());

    expect(db.device.findMany.mock.calls[0][0].where.AND[0]).toEqual({
      workspaceId: WORKSPACE_ID,
    });
  });
});

describe("deviceController.getOne", () => {
  it("returns 404 for an unknown device", async () => {
    db.device.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.getOne(mockRequest({ params: { id: 9 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("deviceController.update", () => {
  it("leaves absent fields untouched", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });
    db.device.update.mockResolvedValue(deviceRow());

    await controller.update(
      mockRequest({ params: { id: 1 }, body: { status: "repaired" } }),
      mockResponse(),
    );

    expect(db.device.update.mock.calls[0][0].data).toEqual({
      status: "repaired",
    });
  });

  it("disconnects the customer when customer_id is null", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });
    db.device.update.mockResolvedValue(deviceRow());

    await controller.update(
      mockRequest({ params: { id: 1 }, body: { customer_id: null } }),
      mockResponse(),
    );

    expect(db.device.update.mock.calls[0][0].data).toEqual({
      customer: { disconnect: true },
    });
  });

  it("returns 404 without attempting the update", async () => {
    db.device.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.update(
      mockRequest({ params: { id: 9 }, body: { status: "repaired" } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.device.update).not.toHaveBeenCalled();
  });
});

describe("deviceController.remove", () => {
  it("refuses to delete a device that has repair invoices", async () => {
    db.device.findFirst.mockResolvedValue({
      id: 1,
      _count: { repairInvoices: 2 },
    });

    const res = mockResponse();
    await controller.remove(mockRequest({ params: { id: 1 } }), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(db.device.delete).not.toHaveBeenCalled();
    expect(deleteDeviceImages).not.toHaveBeenCalled();
  });

  it("removes image files before deleting the device", async () => {
    db.device.findFirst.mockResolvedValue({
      id: 1,
      _count: { repairInvoices: 0 },
    });
    db.device.delete.mockResolvedValue({ id: 1 });

    const res = mockResponse();
    await controller.remove(mockRequest({ params: { id: 1 } }), res);

    expect(deleteDeviceImages).toHaveBeenCalledWith(1, WORKSPACE_ID);
    expect(db.device.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(res.json).toHaveBeenCalledWith({
      message: "دستگاه و عکس‌های آن حذف شد",
    });
  });

  it("returns 404 for an unknown device", async () => {
    db.device.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.remove(mockRequest({ params: { id: 9 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("deviceController.create", () => {
  it("stamps the caller's workspace on the new device", async () => {
    db.device.create.mockResolvedValue(deviceRow());

    await controller.create(
      mockRequest({ body: { device_name: "یخچال", status: "pending" } }),
      mockResponse(),
    );

    expect(db.device.create.mock.calls[0][0].data).toMatchObject({
      workspaceId: WORKSPACE_ID,
      deviceName: "یخچال",
    });
  });
});
