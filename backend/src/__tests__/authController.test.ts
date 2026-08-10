import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import * as controller from "../controllers/authController";
import prisma from "../lib/prisma";
import {
  currentWorkspaceId,
  runWithRequestContext,
} from "../lib/workspaceContext";
import { JWT_SECRET } from "../middleware/auth";

jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: {
    // login reads its candidate through app_login_lookup(), the one query
    // that runs before a workspace is known.
    $queryRaw: jest.fn(),
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const db = prisma as unknown as {
  $queryRaw: jest.Mock;
  user: Record<string, jest.Mock>;
};

function mockResponse() {
  const res = {} as Response & { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const WORKSPACE_ID = 1;

function mockRequest(
  valid: Record<string, unknown> = {},
  actor?: { id: number },
) {
  return {
    valid: { body: undefined, params: undefined, query: undefined, ...valid },
    // login runs before authentication, but me and changePassword read the
    // token's user — and every account belongs to a workspace.
    user: actor ? { ...actor, workspaceId: WORKSPACE_ID } : undefined,
  } as unknown as Request;
}

/**
 * login writes the caller's workspace into the async context once the
 * password checks out, which requires a context to already be open — in
 * production that's the requestContext middleware. Wrapping here keeps the
 * real workspaceContext module in play rather than mocking it away.
 */
function login(req: Request, res: Response) {
  return runWithRequestContext(() => controller.login(req, res));
}

const correctPassword = "secret123";
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await bcrypt.hash(correctPassword, 10);
});

/** The four columns app_login_lookup() returns, in snake_case as SQL gives them. */
function candidateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    workspace_id: WORKSPACE_ID,
    password: passwordHash,
    is_active: true,
    ...overrides,
  };
}

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    workspaceId: WORKSPACE_ID,
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
    db.$queryRaw.mockResolvedValue([]);
    const unknownUser = mockResponse();
    await login(mockRequest({ body: credentials }), unknownUser);

    db.$queryRaw.mockResolvedValue([candidateRow()]);
    const wrongPassword = mockResponse();
    await login(
      mockRequest({ body: { ...credentials, password: "wrong" } }),
      wrongPassword,
    );

    expect(unknownUser.status).toHaveBeenCalledWith(401);
    expect(wrongPassword.status).toHaveBeenCalledWith(401);
    expect(unknownUser.json.mock.calls[0][0]).toEqual(
      wrongPassword.json.mock.calls[0][0],
    );
  });

  it("refuses a disabled account with 403 without reading the full record", async () => {
    db.$queryRaw.mockResolvedValue([candidateRow({ is_active: false })]);

    const res = mockResponse();
    await login(mockRequest({ body: credentials }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(db.user.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("establishes the workspace context before reading the user", async () => {
    db.$queryRaw.mockResolvedValue([candidateRow()]);
    db.user.findUniqueOrThrow.mockResolvedValue(userRow());

    // Without this the follow-up read would run with no workspace set, which
    // RLS answers with no rows — a login that silently fails at the last step.
    let contextDuringLogin: number | undefined;
    await runWithRequestContext(async () => {
      await controller.login(
        mockRequest({ body: credentials }),
        mockResponse(),
      );
      contextDuringLogin = currentWorkspaceId();
    });

    expect(contextDuringLogin).toBe(WORKSPACE_ID);
  });

  it("issues a token carrying the user's id and role name", async () => {
    db.$queryRaw.mockResolvedValue([candidateRow()]);
    db.user.findUniqueOrThrow.mockResolvedValue(userRow());

    const res = mockResponse();
    await login(mockRequest({ body: credentials }), res);

    const { token } = res.json.mock.calls[0][0];
    const payload = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;

    // workspaceId travels in the token so every tenant-scoped query can read
    // it without a database round-trip.
    expect(payload).toMatchObject({
      id: 1,
      workspaceId: WORKSPACE_ID,
      username: "superadmin",
      role: "super_admin",
      isActive: true,
    });
  });

  it("never returns the password hash", async () => {
    db.$queryRaw.mockResolvedValue([candidateRow()]);
    db.user.findUniqueOrThrow.mockResolvedValue(userRow());

    const res = mockResponse();
    await login(mockRequest({ body: credentials }), res);

    const { user } = res.json.mock.calls[0][0];
    expect(user).not.toHaveProperty("password");
    expect(user).toMatchObject({
      id: 1,
      workspace_id: WORKSPACE_ID,
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
