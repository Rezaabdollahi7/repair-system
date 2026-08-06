import { Request, Response } from "express";
import * as controller from "../controllers/customerController";
import prisma from "../lib/prisma";

jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: {
    customer: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    device: {
      findMany: jest.fn(),
    },
  },
}));

const db = prisma as unknown as {
  customer: Record<string, jest.Mock>;
  device: Record<string, jest.Mock>;
};

function mockResponse() {
  const res = {} as Response & { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// Handlers read from req.valid, which validate() populates upstream, so the
// tests supply it directly rather than running the middleware.
function mockRequest(valid: Record<string, unknown> = {}) {
  return {
    valid: { body: undefined, params: undefined, query: undefined, ...valid },
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
    db.customer.findUnique.mockResolvedValue(null);

    const res = mockResponse();
    await controller.getOne(mockRequest({ params: { id: 9 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "مشتری یافت نشد" });
  });

  it("serializes the customer into snake_case", async () => {
    db.customer.findUnique.mockResolvedValue({
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

describe("customerController.getStats", () => {
  it("counts repaired and delivered devices and averages repair days", async () => {
    db.device.findMany.mockResolvedValue([
      {
        status: "repaired",
        entryDate: new Date("2026-01-01T00:00:00.000Z"),
        exitDate: new Date("2026-01-03T00:00:00.000Z"),
      },
      {
        status: "delivered",
        entryDate: new Date("2026-01-01T00:00:00.000Z"),
        exitDate: new Date("2026-01-05T00:00:00.000Z"),
      },
      { status: "received", entryDate: null, exitDate: null },
    ]);

    const res = mockResponse();
    await controller.getStats(mockRequest({ params: { id: 1 } }), res);

    expect(res.json).toHaveBeenCalledWith({
      total_devices: 3,
      successful_repairs: 2,
      avg_repair_days: "3.0",
    });
  });

  it("reports a null average when no device has both dates", async () => {
    db.device.findMany.mockResolvedValue([
      { status: "received", entryDate: null, exitDate: null },
    ]);

    const res = mockResponse();
    await controller.getStats(mockRequest({ params: { id: 1 } }), res);

    expect(res.json).toHaveBeenCalledWith({
      total_devices: 1,
      successful_repairs: 0,
      avg_repair_days: null,
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
      data: { name: "رضا", phone: null },
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe("customerController.update", () => {
  it("returns 404 without attempting the update", async () => {
    db.customer.findUnique.mockResolvedValue(null);

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
  it("answers success even for an id that no longer exists", async () => {
    db.customer.deleteMany.mockResolvedValue({ count: 0 });

    const res = mockResponse();
    await controller.remove(mockRequest({ params: { id: 99 } }), res);

    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});
