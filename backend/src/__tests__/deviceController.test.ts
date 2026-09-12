import { Request, Response } from "express";
import * as controller from "../controllers/deviceController";
import prisma from "../lib/prisma";
import { deleteDeviceImages } from "../controllers/imageController";
import { notifyCustomer } from "../utils/customerNotification";

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

// Mocked deliberately: what this file is about is which message the
// controller decides is owed, not what the service does with it. The wallet,
// the refusals and the refund are covered against a real database in
// integration/customerNotification.test.ts.
//
// transitionNotification is NOT mocked — it is the pure rule this controller
// is built around, and stubbing it would leave the §10 tests below asserting
// that a mock returns what the mock was told to return.
jest.mock("../utils/customerNotification", () => {
  const actual = jest.requireActual("../utils/customerNotification");

  return {
    ...actual,
    notifyCustomer: jest.fn().mockResolvedValue({
      smsMessageId: 9,
      status: "sent",
      costRials: 3_500,
    }),
  };
});

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

// ── Customer notifications (12.7) ────────────────────────────
//
// The rules here are §10 and §11 of the brief, and they are the part of this
// feature with the most ways to be quietly wrong: a message that fires on a
// value instead of a transition texts the same customer every time anybody
// edits the row.

describe("the message a device write owes its customer", () => {
  const customer = { name: "علی رضایی", phone: "09121234567" };

  function seedUpdate(previousStatus: string, nextStatus: string) {
    db.device.findFirst.mockResolvedValue({ id: 1, status: previousStatus });
    db.device.update.mockResolvedValue(
      deviceRow({ status: nextStatus, customer }),
    );
  }

  it("texts an acceptance when a device is taken in", async () => {
    db.device.create.mockResolvedValue(deviceRow({ customer }));

    await controller.create(
      mockRequest({
        body: { device_name: "یخچال", status: "pending", send_sms: true },
      }),
      mockResponse(),
    );

    expect(jest.mocked(notifyCustomer).mock.calls[0][0]).toMatchObject({
      kind: "device_accepted",
      workspaceId: WORKSPACE_ID,
      device: { id: 1, deviceName: "یخچال" },
    });
  });

  it("says nothing when the box was not ticked", async () => {
    db.device.create.mockResolvedValue(deviceRow({ customer }));

    await controller.create(
      mockRequest({ body: { device_name: "یخچال", status: "pending" } }),
      mockResponse(),
    );

    expect(notifyCustomer).not.toHaveBeenCalled();
  });

  it("texts on a real move to ready, and to delivered", async () => {
    for (const [from, to, kind] of [
      ["repairing", "ready_for_pickup", "device_ready"],
      ["ready_for_pickup", "delivered", "device_delivered"],
    ]) {
      jest.mocked(notifyCustomer).mockClear();
      seedUpdate(from, to);

      await controller.update(
        mockRequest({
          params: { id: 1 },
          body: { status: to, send_sms: true },
        }),
        mockResponse(),
      );

      expect(jest.mocked(notifyCustomer).mock.calls[0][0]).toMatchObject({
        kind,
      });
    }
  });

  it("stays quiet when the status did not actually move", async () => {
    // §10. A device edited while already ready — a note corrected, a
    // technician reassigned — must not tell the customer a second time.
    seedUpdate("ready_for_pickup", "ready_for_pickup");

    await controller.update(
      mockRequest({
        params: { id: 1 },
        body: { description: "یادداشت تازه", send_sms: true },
      }),
      mockResponse(),
    );

    expect(notifyCustomer).not.toHaveBeenCalled();
  });

  it("never re-sends an acceptance from an edit", async () => {
    // §11. Whatever the status does on an update, `device_accepted` is not
    // reachable from this handler — there is no branch that produces it.
    for (const [from, to] of [
      ["pending", "repairing"],
      ["delivered", "pending"],
      ["repairing", "ready_for_pickup"],
    ]) {
      jest.mocked(notifyCustomer).mockClear();
      seedUpdate(from, to);

      await controller.update(
        mockRequest({
          params: { id: 1 },
          body: { status: to, send_sms: true },
        }),
        mockResponse(),
      );

      const kinds = jest
        .mocked(notifyCustomer)
        .mock.calls.map((call) => call[0].kind);
      expect(kinds).not.toContain("device_accepted");
    }
  });

  it("sends nothing for a status with no message", async () => {
    // Seven of the nine states say nothing to a customer, `repaired` among
    // them: the bench is done, but the job has not been checked or priced.
    for (const to of [
      "repaired",
      "unrepairable",
      "not_repaired",
      "diagnosing",
    ]) {
      jest.mocked(notifyCustomer).mockClear();
      seedUpdate("repairing", to);

      await controller.update(
        mockRequest({
          params: { id: 1 },
          body: { status: to, send_sms: true },
        }),
        mockResponse(),
      );

      expect(notifyCustomer).not.toHaveBeenCalled();
    }
  });

  it("decides from the stored status, not from the request body", async () => {
    // An update that leaves `status` out has not changed it. Comparing
    // against the body would read that absence as a move to undefined, which
    // is not equal to the old value — and would text the customer for an
    // edit that changed a serial number.
    seedUpdate("delivered", "delivered");

    await controller.update(
      mockRequest({
        params: { id: 1 },
        body: { serial_number: "SN-2", send_sms: true },
      }),
      mockResponse(),
    );

    expect(notifyCustomer).not.toHaveBeenCalled();
  });

  it("hands the outcome back on the response", async () => {
    // So the modal can say what became of the message. The device saved
    // either way — this is information, not a status code.
    db.device.create.mockResolvedValue(deviceRow({ customer }));
    const res = mockResponse();

    await controller.create(
      mockRequest({
        body: { device_name: "یخچال", status: "pending", send_sms: true },
      }),
      res,
    );

    expect(res.json.mock.calls[0][0]).toMatchObject({
      id: 1,
      sms: { status: "sent", costRials: 3_500 },
    });
  });
});
