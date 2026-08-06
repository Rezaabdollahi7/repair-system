import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import * as controller from "../controllers/personnelController";
import prisma from "../lib/prisma";

jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    role: { findUnique: jest.fn() },
  },
}));

const db = prisma as unknown as {
  user: Record<string, jest.Mock>;
  role: Record<string, jest.Mock>;
};

function mockResponse() {
  const res = {} as Response & { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockRequest(
  valid: Record<string, unknown> = {},
  actor?: { id: number; role: string },
) {
  return {
    valid: { body: undefined, params: undefined, query: undefined, ...valid },
    user: actor,
  } as unknown as Request;
}

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 3,
    fullName: "علی",
    username: "ali",
    phone: "0912",
    avatar: null,
    roleId: 3,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    role: { name: "technician", label: "تکنسین" },
    ...overrides,
  };
}

const superAdmin = { id: 1, role: "super_admin" };
const admin = { id: 2, role: "admin" };

beforeEach(() => {
  jest.clearAllMocks();
});

describe("personnelController.getAll", () => {
  it("flattens the role relation into role_name and role_label", async () => {
    db.user.findMany.mockResolvedValue([userRow()]);

    const res = mockResponse();
    await controller.getAll(mockRequest({ query: {} }), res);

    expect(res.json).toHaveBeenCalledWith([
      {
        id: 3,
        full_name: "علی",
        username: "ali",
        phone: "0912",
        avatar: null,
        role_id: 3,
        is_active: true,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
        role_name: "technician",
        role_label: "تکنسین",
      },
    ]);
  });

  it("filters by role name when asked", async () => {
    db.user.findMany.mockResolvedValue([]);

    await controller.getAll(
      mockRequest({ query: { role: "technician" } }),
      mockResponse(),
    );

    expect(db.user.findMany.mock.calls[0][0].where).toEqual({
      role: { name: "technician" },
    });
  });

  it("searches name, username and phone", async () => {
    db.user.findMany.mockResolvedValue([]);

    await controller.getAll(
      mockRequest({ query: { search: "علی" } }),
      mockResponse(),
    );

    expect(db.user.findMany.mock.calls[0][0].where.OR).toHaveLength(3);
  });

  it("never selects the password column", async () => {
    db.user.findMany.mockResolvedValue([]);

    await controller.getAll(mockRequest({ query: {} }), mockResponse());

    expect(db.user.findMany.mock.calls[0][0].select).not.toHaveProperty(
      "password",
    );
  });
});

describe("personnelController.create", () => {
  const body = {
    full_name: "علی",
    username: "ali",
    password: "secret123",
    phone: null,
    role_id: 3,
  };

  it("rejects an unknown role", async () => {
    db.role.findUnique.mockResolvedValue(null);

    const res = mockResponse();
    await controller.create(mockRequest({ body }, superAdmin), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("stops an admin from creating anyone but a technician", async () => {
    db.role.findUnique.mockResolvedValue({ name: "admin" });

    const res = mockResponse();
    await controller.create(
      mockRequest({ body: { ...body, role_id: 2 } }, admin),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("lets a super admin create an admin", async () => {
    db.role.findUnique.mockResolvedValue({ name: "admin" });
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue(userRow());

    const res = mockResponse();
    await controller.create(
      mockRequest({ body: { ...body, role_id: 2 } }, superAdmin),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("rejects a duplicate username with 409", async () => {
    db.role.findUnique.mockResolvedValue({ name: "technician" });
    db.user.findUnique.mockResolvedValue({ id: 9 });

    const res = mockResponse();
    await controller.create(mockRequest({ body }, superAdmin), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("hashes the password before storing it", async () => {
    db.role.findUnique.mockResolvedValue({ name: "technician" });
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue(userRow());

    await controller.create(mockRequest({ body }, superAdmin), mockResponse());

    const stored = db.user.create.mock.calls[0][0].data.password;
    expect(stored).not.toBe("secret123");
    expect(await bcrypt.compare("secret123", stored)).toBe(true);
  });
});

describe("personnelController.update", () => {
  it("returns 404 for an unknown user", async () => {
    db.user.findUnique.mockResolvedValue(null);

    const res = mockResponse();
    await controller.update(
      mockRequest(
        { params: { id: 9 }, body: { full_name: "رضا" } },
        superAdmin,
      ),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("allows a user to keep their own username", async () => {
    db.user.findUnique.mockResolvedValue({ id: 3 });
    db.user.findFirst.mockResolvedValue(null);
    db.user.update.mockResolvedValue(userRow());

    const res = mockResponse();
    await controller.update(
      mockRequest({ params: { id: 3 }, body: { username: "ali" } }, superAdmin),
      res,
    );

    expect(db.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { username: "ali", id: { not: 3 } },
      }),
    );
    expect(res.status).not.toHaveBeenCalledWith(409);
  });

  it("leaves absent fields untouched", async () => {
    db.user.findUnique.mockResolvedValue({ id: 3 });
    db.user.update.mockResolvedValue(userRow());

    await controller.update(
      mockRequest({ params: { id: 3 }, body: { phone: "0913" } }, superAdmin),
      mockResponse(),
    );

    expect(db.user.update.mock.calls[0][0].data).toEqual({ phone: "0913" });
  });

  it("stops an admin from promoting someone to admin", async () => {
    db.user.findUnique.mockResolvedValue({ id: 3 });
    db.role.findUnique.mockResolvedValue({ name: "admin" });

    const res = mockResponse();
    await controller.update(
      mockRequest({ params: { id: 3 }, body: { role_id: 2 } }, admin),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("personnelController.toggleActive", () => {
  it("refuses to deactivate the caller's own account", async () => {
    const res = mockResponse();
    await controller.toggleActive(
      mockRequest({ params: { id: 2 } }, admin),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("stops an admin from deactivating a super admin", async () => {
    db.user.findUnique.mockResolvedValue({
      isActive: true,
      role: { name: "super_admin" },
    });

    const res = mockResponse();
    await controller.toggleActive(
      mockRequest({ params: { id: 1 } }, admin),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("flips the flag and reports it as a boolean", async () => {
    db.user.findUnique.mockResolvedValue({
      isActive: true,
      role: { name: "technician" },
    });
    db.user.update.mockResolvedValue(userRow({ isActive: false }));

    const res = mockResponse();
    await controller.toggleActive(
      mockRequest({ params: { id: 3 } }, superAdmin),
      res,
    );

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { isActive: false },
    });
    expect(res.json).toHaveBeenCalledWith({
      message: "حساب غیرفعال شد",
      is_active: false,
    });
  });
});

describe("personnelController.remove", () => {
  it("refuses to delete the caller's own account", async () => {
    const res = mockResponse();
    await controller.remove(
      mockRequest({ params: { id: 1 } }, superAdmin),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.user.delete).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown user", async () => {
    db.user.findUnique.mockResolvedValue(null);

    const res = mockResponse();
    await controller.remove(
      mockRequest({ params: { id: 9 } }, superAdmin),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.user.delete).not.toHaveBeenCalled();
  });

  it("deletes the user and lets the schema detach their records", async () => {
    db.user.findUnique.mockResolvedValue({ id: 3 });
    db.user.delete.mockResolvedValue({ id: 3 });

    const res = mockResponse();
    await controller.remove(
      mockRequest({ params: { id: 3 } }, superAdmin),
      res,
    );

    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: 3 } });
    expect(res.json).toHaveBeenCalledWith({
      message: "پرسنل با موفقیت حذف شد",
    });
  });
});
