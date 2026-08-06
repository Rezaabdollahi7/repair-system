import { Request, Response } from "express";
import * as controller from "../controllers/categoryController";
import prisma from "../lib/prisma";

jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: {
    category: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

const db = prisma as unknown as { category: Record<string, jest.Mock> };

function mockResponse() {
  const res = {} as Response & { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockRequest(valid: Record<string, unknown> = {}) {
  return {
    valid: { body: undefined, params: undefined, query: undefined, ...valid },
  } as unknown as Request;
}

function categoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "قطعات برد",
    description: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

// What Prisma throws on a unique-constraint violation.
const duplicateError = Object.assign(new Error("Unique constraint failed"), {
  code: "P2002",
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("categoryController.getAll", () => {
  it("answers in camelCase, as this endpoint always has", async () => {
    db.category.findMany.mockResolvedValue([categoryRow()]);

    const res = mockResponse();
    await controller.getAll(mockRequest(), res);

    expect(res.json).toHaveBeenCalledWith([
      {
        id: 1,
        name: "قطعات برد",
        description: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
  });
});

describe("categoryController.getById", () => {
  it("returns 404 for an unknown category", async () => {
    db.category.findUnique.mockResolvedValue(null);

    const res = mockResponse();
    await controller.getById(mockRequest({ params: { id: 9 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("categoryController.create", () => {
  it("reports a duplicate name as 400 rather than 500", async () => {
    db.category.create.mockRejectedValue(duplicateError);

    const res = mockResponse();
    await controller.create(
      mockRequest({ body: { name: "قطعات برد", description: null } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "این نام قبلاً ثبت شده است",
    });
  });

  it("persists the validated body and answers 201", async () => {
    db.category.create.mockResolvedValue(categoryRow());

    const res = mockResponse();
    await controller.create(
      mockRequest({ body: { name: "قطعات برد", description: null } }),
      res,
    );

    expect(db.category.create).toHaveBeenCalledWith({
      data: { name: "قطعات برد", description: null },
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe("categoryController.update", () => {
  it("returns 404 without attempting the update", async () => {
    db.category.findUnique.mockResolvedValue(null);

    const res = mockResponse();
    await controller.update(
      mockRequest({
        params: { id: 9 },
        body: { name: "x", description: null },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.category.update).not.toHaveBeenCalled();
  });

  it("reports a duplicate name as 400", async () => {
    db.category.findUnique.mockResolvedValue({ id: 1 });
    db.category.update.mockRejectedValue(duplicateError);

    const res = mockResponse();
    await controller.update(
      mockRequest({
        params: { id: 1 },
        body: { name: "x", description: null },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("categoryController.remove", () => {
  it("refuses to delete a category that still has items", async () => {
    db.category.findUnique.mockResolvedValue({ _count: { items: 3 } });

    const res = mockResponse();
    await controller.remove(mockRequest({ params: { id: 1 } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "این دسته‌بندی دارای 3 کالا است و قابل حذف نیست",
    });
    expect(db.category.delete).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown category", async () => {
    db.category.findUnique.mockResolvedValue(null);

    const res = mockResponse();
    await controller.remove(mockRequest({ params: { id: 9 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("deletes an empty category", async () => {
    db.category.findUnique.mockResolvedValue({ _count: { items: 0 } });
    db.category.delete.mockResolvedValue(categoryRow());

    const res = mockResponse();
    await controller.remove(mockRequest({ params: { id: 1 } }), res);

    expect(db.category.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(res.json).toHaveBeenCalledWith({
      message: "دسته‌بندی با موفقیت حذف شد",
    });
  });
});
