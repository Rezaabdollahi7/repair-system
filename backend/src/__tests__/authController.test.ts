import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import * as controller from "../controllers/authController";
import prisma, { runInNewWorkspaceTransaction } from "../lib/prisma";
import { populateWorkspace } from "../utils/newWorkspace";
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
    refreshToken: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
  runInNewWorkspaceTransaction: jest.fn(),
}));

// Mocked separately from the controller: what a new workspace is furnished
// with is its own concern, covered in newWorkspace.test.ts. These tests are
// about what register does with the result.
jest.mock("../utils/newWorkspace", () => ({
  __esModule: true,
  populateWorkspace: jest.fn(),
}));

const db = prisma as unknown as {
  $queryRaw: jest.Mock;
  user: Record<string, jest.Mock>;
  refreshToken: Record<string, jest.Mock>;
};

const runInNewWorkspace = runInNewWorkspaceTransaction as unknown as jest.Mock;
const populate = populateWorkspace as unknown as jest.Mock;

/** A workspace id that is not WORKSPACE_ID, so a mix-up would be visible. */
const NEW_WORKSPACE_ID = 7;

function mockResponse() {
  const res = {} as Response & {
    status: jest.Mock;
    json: jest.Mock;
    cookie: jest.Mock;
    clearCookie: jest.Mock;
  };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
}

const WORKSPACE_ID = 1;

function mockRequest(
  valid: Record<string, unknown> = {},
  actor?: { id: number },
  cookies: Record<string, string> = {},
) {
  return {
    valid: { body: undefined, params: undefined, query: undefined, ...valid },
    // login runs before authentication, but me and changePassword read the
    // token's user — and every account belongs to a workspace.
    user: actor ? { ...actor, workspaceId: WORKSPACE_ID } : undefined,
    // refresh and logout take their credential from an httpOnly cookie, not
    // a header: script that got onto the page cannot read it.
    cookies,
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

  // Runs the callback the way the real helper does: the workspace exists by
  // then, so its id is handed to the callback rather than read from context.
  runInNewWorkspace.mockImplementation(
    (_name: string, fn: (tx: unknown, workspaceId: number) => unknown) =>
      fn({}, NEW_WORKSPACE_ID),
  );
  // Every successful sign-in writes one of these.
  db.refreshToken.create.mockResolvedValue({ id: 1 });
  db.refreshToken.update.mockResolvedValue({ id: 1 });
  db.refreshToken.updateMany.mockResolvedValue({ count: 1 });
  db.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
});

describe("authController.register", () => {
  const body = {
    workspace_name: "تعمیرگاه رضا",
    username: "09123456789",
    password: "testpass123",
  };

  function ownerRow() {
    return userRow({
      id: 9,
      workspaceId: NEW_WORKSPACE_ID,
      fullName: "مدیر",
      username: body.username,
    });
  }

  /**
   * register publishes the new workspace into the async context so the
   * refresh-token row can be written like ordinary tenant data — which needs
   * a context to already be open, as the requestContext middleware does in
   * production.
   */
  function register(req: Request) {
    const res = mockResponse();
    return runWithRequestContext(async () => {
      await controller.register(req, res);
      return res;
    });
  }

  it("creates the workspace and its owner in one call", async () => {
    populate.mockResolvedValue(ownerRow());

    const res = await register(mockRequest({ body }));

    // The name goes to the helper, which passes it to app_create_workspace —
    // the application role has no INSERT on workspaces of its own.
    expect(runInNewWorkspace).toHaveBeenCalledWith(
      body.workspace_name,
      expect.any(Function),
    );
    expect(populate).toHaveBeenCalledWith({}, NEW_WORKSPACE_ID, {
      workspaceName: body.workspace_name,
      username: body.username,
      password: body.password,
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("signs the new owner in rather than sending them to the login form", async () => {
    populate.mockResolvedValue(ownerRow());

    const res = await register(mockRequest({ body }));

    const { token } = res.json.mock.calls[0][0];
    const payload = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;

    expect(payload).toMatchObject({
      id: 9,
      workspaceId: NEW_WORKSPACE_ID,
      username: body.username,
      role: "super_admin",
    });
  });

  it("never returns the password hash", async () => {
    populate.mockResolvedValue(ownerRow());

    const res = await register(mockRequest({ body }));

    const { user } = res.json.mock.calls[0][0];
    expect(user).not.toHaveProperty("password");
    expect(user).toMatchObject({
      workspace_id: NEW_WORKSPACE_ID,
      username: body.username,
      full_name: "مدیر",
    });
  });

  it("reports an already-registered phone as 409, not 500", async () => {
    // The number belongs to whoever is being told, so this reveals nothing
    // they don't already know — unlike login, where the same specificity
    // would enumerate accounts.
    populate.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );

    const res = await register(mockRequest({ body }));

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: "این شماره موبایل قبلاً ثبت شده است",
    });
  });

  it("lets any other failure surface as 500", async () => {
    populate.mockRejectedValue(new Error("connection lost"));

    const res = await register(mockRequest({ body }));

    expect(res.status).toHaveBeenCalledWith(500);
  });
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

describe("authController.refresh", () => {
  const PRESENTED = "a-refresh-token";
  const TOKEN_ROW_ID = 42;

  /** What app_refresh_lookup returns — snake_case, as SQL gives it. */
  function candidateRow(overrides: Record<string, unknown> = {}) {
    return {
      id: TOKEN_ROW_ID,
      user_id: 1,
      workspace_id: WORKSPACE_ID,
      expires_at: new Date(Date.now() + 60_000),
      revoked_at: null,
      ...overrides,
    };
  }

  function refresh(
    cookies: Record<string, string> = { dofixo_refresh: PRESENTED },
  ) {
    const res = mockResponse();
    return runWithRequestContext(async () => {
      await controller.refresh(mockRequest({}, undefined, cookies), res);
      return res;
    });
  }

  it("rotates the token and hands back a fresh access token", async () => {
    db.$queryRaw.mockResolvedValue([candidateRow()]);
    db.user.findUnique.mockResolvedValue(userRow());

    const res = await refresh();

    // Marked rather than deleted: a stolen copy presented later has to read
    // as revoked, not as unknown.
    expect(db.refreshToken.update).toHaveBeenCalledWith({
      where: { id: TOKEN_ROW_ID },
      data: { revokedAt: expect.any(Date) },
    });
    expect(db.refreshToken.create).toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toHaveProperty("token");
  });

  it("refuses a request with no cookie at all", async () => {
    const res = await refresh({});

    expect(res.status).toHaveBeenCalledWith(401);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("refuses an unknown token and clears the cookie", async () => {
    db.$queryRaw.mockResolvedValue([]);

    const res = await refresh();

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.clearCookie).toHaveBeenCalled();
    expect(db.refreshToken.create).not.toHaveBeenCalled();
  });

  it("ends every session when a revoked token is presented again", async () => {
    db.$queryRaw.mockResolvedValue([
      candidateRow({ revoked_at: new Date(Date.now() - 1000) }),
    ]);

    const res = await refresh();

    // The legitimate holder rotated this away, so whoever sent it kept an
    // old copy. Which of the two is the thief is unknowable, so both are
    // made to sign in again.
    expect(db.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 1, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(db.refreshToken.create).not.toHaveBeenCalled();
  });

  it("refuses an expired token without ending other sessions", async () => {
    db.$queryRaw.mockResolvedValue([
      candidateRow({ expires_at: new Date(Date.now() - 1000) }),
    ]);

    const res = await refresh();

    // Ageing out is ordinary, unlike a replay — nothing suspicious happened.
    expect(res.status).toHaveBeenCalledWith(401);
    expect(db.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("refuses an account disabled since the token was issued", async () => {
    db.$queryRaw.mockResolvedValue([candidateRow()]);
    db.user.findUnique.mockResolvedValue(userRow({ isActive: false }));

    const res = await refresh();

    expect(res.status).toHaveBeenCalledWith(401);
    expect(db.refreshToken.create).not.toHaveBeenCalled();
  });

  it("says the same thing however it failed", async () => {
    db.$queryRaw.mockResolvedValue([]);
    const unknown = await refresh();

    db.$queryRaw.mockResolvedValue([
      candidateRow({ expires_at: new Date(Date.now() - 1000) }),
    ]);
    const expired = await refresh();

    // Which failure it was is information about somebody else's session.
    expect(unknown.json.mock.calls[0][0]).toEqual(
      expired.json.mock.calls[0][0],
    );
  });

  it("clears expired rows for this user while it is here", async () => {
    db.$queryRaw.mockResolvedValue([candidateRow()]);
    db.user.findUnique.mockResolvedValue(userRow());

    await refresh();

    // Without this the table only ever grows, and these rows can never be
    // useful again.
    expect(db.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 1, expiresAt: { lt: expect.any(Date) } },
    });
  });
});

describe("authController.logout", () => {
  function logout(cookies: Record<string, string>) {
    const res = mockResponse();
    return runWithRequestContext(async () => {
      await controller.logout(mockRequest({}, undefined, cookies), res);
      return res;
    });
  }

  it("revokes only the session it was given", async () => {
    db.$queryRaw.mockResolvedValue([
      {
        id: 42,
        user_id: 1,
        workspace_id: WORKSPACE_ID,
        expires_at: new Date(),
        revoked_at: null,
      },
    ]);

    const res = await logout({ dofixo_refresh: "a-refresh-token" });

    // Signing out on a phone shouldn't sign the shop's desktop out too.
    expect(db.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { id: 42 },
    });
    // Not marked revoked: that is reserved for rotation, where a replay means
    // a copy is in circulation and every session has to end.
    expect(db.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it("succeeds even with no cookie", async () => {
    const res = await logout({});

    // The caller wanted to be logged out, and they are.
    expect(res.clearCookie).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  it("succeeds with a token that no longer exists", async () => {
    db.$queryRaw.mockResolvedValue([]);

    const res = await logout({ dofixo_refresh: "stale" });

    expect(res.clearCookie).toHaveBeenCalled();
    expect(db.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
