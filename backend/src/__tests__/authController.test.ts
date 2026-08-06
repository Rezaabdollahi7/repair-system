import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import * as controller from "../controllers/authController";
import prisma from "../lib/prisma";
import { JWT_SECRET } from "../middleware/auth";

jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

const db = prisma as unknown as { user: Record<string, jest.Mock> };

function mockResponse() {
  const res = {} as Response & { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockRequest(
  valid: Record<string, unknown> = {},
  actor?: { id: number },
) {
  return {
    valid: { body: undefined, params: undefined, query: undefined, ...valid },
    user: actor,
  } as unknown as Request;
}

const correctPassword = "secret123";
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await bcrypt.hash(correctPassword, 10);
});

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    fullName: "سوپر ادمین",
    username: "superadmin",
    password: passwordHash,
    phone: null,
    avatar: null,
    roleId: 1,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    role: { name: "super_admin", label: "سوپر ادمین" },
    ...overrides,
  };
}

const credentials = { username: "superadmin", password: correctPassword };

beforeEach(() => {
  jest.clearAllMocks();
});

describe("authController.login", () => {
  it("gives the same message for an unknown user as for a wrong password", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const unknownUser = mockResponse();
    await controller.login(mockRequest({ body: credentials }), unknownUser);

    db.user.findUnique.mockResolvedValue(userRow());
    const wrongPassword = mockResponse();
    await controller.login(
      mockRequest({ body: { ...credentials, password: "wrong" } }),
      wrongPassword,
    );

    expect(unknownUser.status).toHaveBeenCalledWith(401);
    expect(wrongPassword.status).toHaveBeenCalledWith(401);
    expect(unknownUser.json.mock.calls[0][0]).toEqual(
      wrongPassword.json.mock.calls[0][0],
    );
  });

  it("refuses a disabled account with 403", async () => {
    db.user.findUnique.mockResolvedValue(userRow({ isActive: false }));

    const res = mockResponse();
    await controller.login(mockRequest({ body: credentials }), res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("issues a token carrying the user's id and role name", async () => {
    db.user.findUnique.mockResolvedValue(userRow());

    const res = mockResponse();
    await controller.login(mockRequest({ body: credentials }), res);

    const { token } = res.json.mock.calls[0][0];
    const payload = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;

    expect(payload).toMatchObject({
      id: 1,
      username: "superadmin",
      role: "super_admin",
      isActive: true,
    });
  });

  it("never returns the password hash", async () => {
    db.user.findUnique.mockResolvedValue(userRow());

    const res = mockResponse();
    await controller.login(mockRequest({ body: credentials }), res);

    const { user } = res.json.mock.calls[0][0];
    expect(user).not.toHaveProperty("password");
    expect(user).toMatchObject({
      id: 1,
      full_name: "سوپر ادمین",
      is_active: true,
      role: "super_admin",
      role_label: "سوپر ادمین",
    });
  });
});

describe("authController.me", () => {
  it("rejects an account disabled after the token was issued", async () => {
    db.user.findUnique.mockResolvedValue(userRow({ isActive: false }));

    const res = mockResponse();
    await controller.me(mockRequest({}, { id: 1 }), res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns 404 when the user no longer exists", async () => {
    db.user.findUnique.mockResolvedValue(null);

    const res = mockResponse();
    await controller.me(mockRequest({}, { id: 1 }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("authController.changePassword", () => {
  const body = {
    current_password: correctPassword,
    new_password: "brandnew123",
  };

  it("rejects a wrong current password without writing", async () => {
    db.user.findUnique.mockResolvedValue({ password: passwordHash });

    const res = mockResponse();
    await controller.changePassword(
      mockRequest({ body: { ...body, current_password: "wrong" } }, { id: 1 }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("stores the new password hashed", async () => {
    db.user.findUnique.mockResolvedValue({ password: passwordHash });
    db.user.update.mockResolvedValue({ id: 1 });

    const res = mockResponse();
    await controller.changePassword(mockRequest({ body }, { id: 1 }), res);

    const stored = db.user.update.mock.calls[0][0].data.password;
    expect(stored).not.toBe("brandnew123");
    expect(await bcrypt.compare("brandnew123", stored)).toBe(true);
    expect(res.json).toHaveBeenCalledWith({
      message: "رمز عبور با موفقیت تغییر کرد",
    });
  });
});
