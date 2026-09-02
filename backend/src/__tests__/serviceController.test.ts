import { Request, Response } from "express";
import * as controller from "../controllers/serviceController";
import prisma from "../lib/prisma";

jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: {
    service: {
      findMany: jest.fn(),
      // findFirst rather than findUnique: the controller pairs id with
      // workspaceId now, which findUnique can't express.
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

const db = prisma as unknown as { service: Record<string, jest.Mock> };

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
// the token carried no workspace — so the mock has to supply one.
const WORKSPACE_ID = 1;

function mockRequest(valid: Record<string, unknown> = {}) {
  return {
    valid: { body: undefined, params: undefined, query: undefined, ...valid },
    user: { id: 3, workspaceId: WORKSPACE_ID, role: "super_admin" },
  } as unknown as Request;
}

function serviceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    workspaceId: WORKSPACE_ID,
    name: "دستمزد تعمیر",
    description: "هزینه تعمیر دستگاه",
    defaultPrice: decimal(500000),
    unit: "خدمت",
    isActive: true,
    sortOrder: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("serviceController.getAll", () => {
  it("returns only active services from the caller's workspace", async () => {
    db.service.findMany.mockResolvedValue([serviceRow()]);

    const res = mockResponse();
    await controller.getAll(mockRequest(), res);

    expect(db.service.findMany).toHaveBeenCalledWith({
      where: { isActive: true, workspaceId: WORKSPACE_ID },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    expect(res.json).toHaveBeenCalledWith([
      {
        id: 1,
        name: "دستمزد تعمیر",
        description: "هزینه تعمیر دستگاه",
        default_price: 500000,
        unit: "خدمت",
        is_active: true,
        sort_order: 0,
      },
    ]);
  });
});

describe("serviceController.create", () => {
  it("maps default_price onto the defaultPrice column", async () => {
    db.service.create.mockResolvedValue(serviceRow());

    const res = mockResponse();
    await controller.create(
      mockRequest({
        body: {
          name: "دستمزد تعمیر",
          description: null,
          default_price: 500000,
          unit: "خدمت",
        },
      }),
      res,
    );

    expect(db.service.create.mock.calls[0][0].data).toEqual({
      workspaceId: WORKSPACE_ID,
      name: "دستمزد تعمیر",
      description: null,
      defaultPrice: 500000,
      unit: "خدمت",
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe("serviceController.update", () => {
  it("returns 404 for a service in another workspace", async () => {
    db.service.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.update(
      mockRequest({ params: { id: 9 }, body: { name: "x" } }),
      res,
    );

    expect(db.service.findFirst.mock.calls[0][0].where).toEqual({
      id: 9,
      workspaceId: WORKSPACE_ID,
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.service.update).not.toHaveBeenCalled();
  });

  it("leaves price and unit untouched when only the name is sent", async () => {
    db.service.findFirst.mockResolvedValue({ id: 1 });
    db.service.update.mockResolvedValue(serviceRow());

    await controller.update(
      mockRequest({ params: { id: 1 }, body: { name: "دستمزد" } }),
      mockResponse(),
    );

    expect(db.service.update.mock.calls[0][0].data).toEqual({
      name: "دستمزد",
    });
  });

  it("accepts false as a deactivating value for is_active", async () => {
    db.service.findFirst.mockResolvedValue({ id: 1 });
    db.service.update.mockResolvedValue(serviceRow({ isActive: false }));

    await controller.update(
      mockRequest({ params: { id: 1 }, body: { is_active: false } }),
      mockResponse(),
    );

    expect(db.service.update.mock.calls[0][0].data).toEqual({
      isActive: false,
    });
  });
});

describe("serviceController.remove", () => {
  it("returns 404 when nothing was deleted", async () => {
    db.service.deleteMany.mockResolvedValue({ count: 0 });

    const res = mockResponse();
    await controller.remove(mockRequest({ params: { id: 9 } }), res);

    expect(db.service.deleteMany).toHaveBeenCalledWith({
      where: { id: 9, workspaceId: WORKSPACE_ID },
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("confirms removal when a row was deleted", async () => {
    db.service.deleteMany.mockResolvedValue({ count: 1 });

    const res = mockResponse();
    await controller.remove(mockRequest({ params: { id: 1 } }), res);

    expect(res.json).toHaveBeenCalledWith({
      message: "خدمت با موفقیت حذف شد",
    });
  });
});
