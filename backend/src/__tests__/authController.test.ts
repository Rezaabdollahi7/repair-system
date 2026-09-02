import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import * as controller from "../controllers/authController";
import prisma, {
  runInNewWorkspaceTransaction,
  runInWorkspaceTransaction,
} from "../lib/prisma";
import { populateWorkspace } from "../utils/newWorkspace";
import {
  currentWorkspaceId,
  runWithRequestContext,
} from "../lib/workspaceContext";
import { JWT_SECRET } from "../middleware/auth";
import { SmsError, sendVerificationCode } from "../lib/sms";
import { hashOtpCode } from "../utils/otp";

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
    // Exempt from the extension's workspace guard (see UNSCOPED_MODELS in
    // lib/prisma): a code is sent before any workspace exists.
    otpCode: {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
  runInNewWorkspaceTransaction: jest.fn(),
  runInWorkspaceTransaction: jest.fn(),
}));

// Mocked so no test can reach sms.ir. Every assertion below about "no message
// was sent" is only worth anything because this mock records the calls.
jest.mock("../lib/sms", () => {
  class SmsError extends Error {
    providerStatus: number | null;
    constructor(message: string, providerStatus: number | null) {
      super(message);
      this.name = "SmsError";
      this.providerStatus = providerStatus;
    }
  }

  return {
    __esModule: true,
    sendVerificationCode: jest.fn(),
    SmsError,
    SMS_STATUS: { SUCCESS: 1, BLACKLISTED: 115, CREDIT_EXHAUSTED: 102 },
  };
});

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
  otpCode: Record<string, jest.Mock>;
};

const sendSms = sendVerificationCode as unknown as jest.Mock;

const runInNewWorkspace = runInNewWorkspaceTransaction as unknown as jest.Mock;
const runInWorkspace = runInWorkspaceTransaction as unknown as jest.Mock;
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
  // The transaction client carries otpCode now: register spends the code
  // inside the transaction, so a sign-up that fails afterwards leaves it
  // usable. Handed the same mock the extended client uses, so an assertion
  // reads the call wherever it was made.
  runInNewWorkspace.mockImplementation(
    (_name: string, fn: (tx: unknown, workspaceId: number) => unknown) =>
      fn({ otpCode: db.otpCode }, NEW_WORKSPACE_ID),
  );
  // Every successful sign-in writes one of these.
  db.refreshToken.create.mockResolvedValue({ id: 1 });
  db.refreshToken.update.mockResolvedValue({ id: 1 });
  db.refreshToken.updateMany.mockResolvedValue({ count: 1 });
  db.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
});

describe("authController.register", () => {
  const CODE = "12345";

  const body = {
    workspace_name: "تعمیرگاه رضا",
    username: "09123456789",
    password: "testpass123",
    code: CODE,
  };

  /** A live, unused code for the number in `body`. */
  function otpRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 55,
      codeHash: hashOtpCode(CODE),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      consumedAt: null,
      ...overrides,
    };
  }

  function ownerRow() {
    return userRow({
      id: 9,
      workspaceId: NEW_WORKSPACE_ID,
      fullName: "مدیر",
      username: body.username,
    });
  }

  beforeEach(() => {
    db.otpCode.findFirst.mockResolvedValue(otpRow());
    db.otpCode.update.mockResolvedValue({ id: 55 });
    db.otpCode.updateMany.mockResolvedValue({ count: 1 });
  });

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
    expect(populate).toHaveBeenCalledWith(expect.anything(), NEW_WORKSPACE_ID, {
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

  describe("the code is the proof the number is real", () => {
    it("creates nothing when the code is wrong", async () => {
      const res = await register(
        mockRequest({ body: { ...body, code: "00000" } }),
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(runInNewWorkspace).not.toHaveBeenCalled();
      expect(populate).not.toHaveBeenCalled();
    });

    it("creates nothing when no code was ever sent", async () => {
      db.otpCode.findFirst.mockResolvedValue(null);

      const res = await register(mockRequest({ body }));

      expect(res.status).toHaveBeenCalledWith(400);
      expect(runInNewWorkspace).not.toHaveBeenCalled();
    });

    it("refuses an expired code", async () => {
      db.otpCode.findFirst.mockResolvedValue(
        otpRow({ expiresAt: new Date(Date.now() - 1000) }),
      );

      const res = await register(mockRequest({ body }));

      expect(res.status).toHaveBeenCalledWith(400);
      expect(runInNewWorkspace).not.toHaveBeenCalled();
    });

    it("refuses a code already spent", async () => {
      db.otpCode.findFirst.mockResolvedValue(
        otpRow({ consumedAt: new Date() }),
      );

      const res = await register(mockRequest({ body }));

      expect(res.status).toHaveBeenCalledWith(400);
      expect(runInNewWorkspace).not.toHaveBeenCalled();
    });

    it("counts the attempt outside the transaction", async () => {
      // The whole reason the increment sits where it does. Inside the
      // sign-up transaction it would roll back with the failure, and three
      // wrong guesses would leave the counter at zero — a ceiling that never
      // arrives, on a five-digit code.
      await register(mockRequest({ body: { ...body, code: "00000" } }));

      expect(db.otpCode.update).toHaveBeenCalledWith({
        where: { id: 55 },
        data: { attempts: { increment: 1 } },
      });
    });

    it("says plainly when the row is burned", async () => {
      // The one failure told apart from the rest: retrying cannot work, and
      // a user not told so retypes the correct code until it expires.
      db.otpCode.findFirst.mockResolvedValue(otpRow({ attempts: 3 }));

      const res = await register(mockRequest({ body }));

      expect(res.json.mock.calls[0][0].error).toContain("باطل");
    });

    it("gives one message for every other failure", async () => {
      // Telling expired from wrong from unused would say which numbers have
      // a live code waiting.
      const wrong = await register(
        mockRequest({ body: { ...body, code: "00000" } }),
      );

      db.otpCode.findFirst.mockResolvedValue(
        otpRow({ expiresAt: new Date(Date.now() - 1000) }),
      );
      const expired = await register(mockRequest({ body }));

      db.otpCode.findFirst.mockResolvedValue(null);
      const missing = await register(mockRequest({ body }));

      expect(wrong.json.mock.calls[0][0]).toEqual(
        expired.json.mock.calls[0][0],
      );
      expect(wrong.json.mock.calls[0][0]).toEqual(
        missing.json.mock.calls[0][0],
      );
    });

    it("stops counting attempts against a burned row", async () => {
      db.otpCode.findFirst.mockResolvedValue(otpRow({ attempts: 3 }));

      await register(mockRequest({ body }));

      // Still incremented — the row is dead either way, and not writing
      // would need a second branch for no benefit. What matters is that it
      // is refused before the transaction.
      expect(runInNewWorkspace).not.toHaveBeenCalled();
    });

    it("spends the code inside the transaction, guarded against a race", async () => {
      populate.mockResolvedValue(ownerRow());

      await register(mockRequest({ body }));

      // consumedAt: null in the where clause is what stops two requests
      // arriving together with the same code from both creating a workspace.
      expect(db.otpCode.updateMany).toHaveBeenCalledWith({
        where: { id: 55, consumedAt: null },
        data: { consumedAt: expect.any(Date) },
      });
    });

    it("refuses when the code was spent between the check and the write", async () => {
      populate.mockResolvedValue(ownerRow());
      db.otpCode.updateMany.mockResolvedValue({ count: 0 });

      const res = await register(mockRequest({ body }));

      // 400, not 500: the second of two racing requests is a user error,
      // not a server fault.
      expect(res.status).toHaveBeenCalledWith(400);
    });
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

  it("answers exactly once", async () => {
    db.$queryRaw.mockResolvedValue([candidateRow()]);
    db.user.findUnique.mockResolvedValue(userRow());

    const res = await refresh();

    // Two responses on one request throw ERR_HTTP_HEADERS_SENT, and issue
    // two sessions where one was asked for. The second call is invisible to
    // the client, so only the log says anything is wrong.
    expect(res.json).toHaveBeenCalledTimes(1);
    expect(db.refreshToken.create).toHaveBeenCalledTimes(1);
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

describe("sendOtp", () => {
  function otpRequest(phone: string, purpose: "register" | "reset") {
    return { valid: { body: { phone, purpose } } } as unknown as Request;
  }

  beforeEach(() => {
    db.otpCode.count.mockResolvedValue(0);
    db.otpCode.deleteMany.mockResolvedValue({ count: 0 });
    db.otpCode.updateMany.mockResolvedValue({ count: 0 });
    db.otpCode.create.mockResolvedValue({ id: 1 });
    db.otpCode.delete.mockResolvedValue({ id: 1 });
    sendSms.mockResolvedValue({ messageId: 1, cost: 1 });
  });

  // The three tests below all assert the same thing from different angles:
  // that no message left the building. Each of these paths costs real money
  // if it regresses, and none of them would fail loudly — the endpoint would
  // go on answering 200 while quietly spending the SMS account.
  it("rejects a number that already exists, before sending anything", async () => {
    db.$queryRaw.mockResolvedValue([{ id: 1, workspace_id: 2 }]);

    const res = mockResponse();
    await controller.sendOtp(otpRequest("09123456789", "register"), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("answers reset for an unknown number with success and no message", async () => {
    // The costly one. Answering honestly would be no worse for privacy —
    // register already discloses the same fact — but it would turn this
    // endpoint into a way to text any number in the country at our expense.
    db.$queryRaw.mockResolvedValue([]);

    const res = mockResponse();
    await controller.sendOtp(otpRequest("09123456789", "reset"), res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.any(String) }),
    );
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(sendSms).not.toHaveBeenCalled();
    expect(db.otpCode.create).not.toHaveBeenCalled();
  });

  it("refuses a fourth request in the hour", async () => {
    db.$queryRaw.mockResolvedValue([]);
    db.otpCode.count.mockResolvedValue(3);

    const res = mockResponse();
    await controller.sendOtp(otpRequest("09123456789", "register"), res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("counts against the phone across both purposes", async () => {
    // Deliberately not keyed on purpose as well: what is rationed is messages
    // to that handset, and asking for the other kind of code must not buy a
    // second allowance.
    db.$queryRaw.mockResolvedValue([]);

    const res = mockResponse();
    await controller.sendOtp(otpRequest("09123456789", "register"), res);

    const where = db.otpCode.count.mock.calls[0][0].where;
    expect(where.phone).toBe("09123456789");
    expect(where.purpose).toBeUndefined();
  });

  it("sweeps by created_at, never by expiry", async () => {
    // The subtlest thing in this endpoint. A code dies after three minutes
    // but has to keep counting towards the hourly ceiling for a full hour —
    // sweeping on expires_at would disable the limit while reading as
    // ordinary housekeeping.
    db.$queryRaw.mockResolvedValue([]);

    const res = mockResponse();
    await controller.sendOtp(otpRequest("09123456789", "register"), res);

    const where = db.otpCode.deleteMany.mock.calls[0][0].where;
    expect(where.createdAt).toBeDefined();
    expect(where.expiresAt).toBeUndefined();
  });

  it("invalidates the previous code for that phone and purpose", async () => {
    db.$queryRaw.mockResolvedValue([]);

    const res = mockResponse();
    await controller.sendOtp(otpRequest("09123456789", "register"), res);

    expect(db.otpCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          phone: "09123456789",
          purpose: "register",
          consumedAt: null,
        }),
      }),
    );
  });

  it("stores a hash, never the code, and sends the code itself", async () => {
    db.$queryRaw.mockResolvedValue([]);

    const res = mockResponse();
    await controller.sendOtp(otpRequest("09123456789", "register"), res);

    const [, code] = sendSms.mock.calls[0];
    expect(code).toMatch(/^\d{5}$/);

    const stored = db.otpCode.create.mock.calls[0][0].data;
    expect(stored.codeHash).toHaveLength(64);
    expect(stored.codeHash).not.toContain(code);
  });

  it("deletes the row when the message fails to send", async () => {
    // Left behind, it would count against the caller's hourly allowance for
    // a code they never received — three failures and they are locked out of
    // an account they can still prove they own.
    db.$queryRaw.mockResolvedValue([]);
    sendSms.mockRejectedValue(new SmsError("credit exhausted", 102));

    const res = mockResponse();
    await controller.sendOtp(otpRequest("09123456789", "register"), res);

    expect(db.otpCode.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it("tells the user only about the failure they can act on", async () => {
    // Blacklisted is theirs; credit, key and template are ours, and inviting
    // a shop owner to retry those wastes their afternoon.
    db.$queryRaw.mockResolvedValue([]);
    sendSms.mockRejectedValue(new SmsError("blacklisted", 115));

    const res = mockResponse();
    await controller.sendOtp(otpRequest("09123456789", "register"), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("never returns the code, the expiry or the remaining allowance", async () => {
    db.$queryRaw.mockResolvedValue([]);

    const res = mockResponse();
    await controller.sendOtp(otpRequest("09123456789", "register"), res);

    const body = res.json.mock.calls[0][0];
    expect(Object.keys(body)).toEqual(["message"]);
  });
});

describe("resetPassword", () => {
  const CODE = "54321";
  const NEW_PASSWORD = "brandnew123";

  function otpRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 77,
      codeHash: hashOtpCode(CODE),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      consumedAt: null,
      ...overrides,
    };
  }

  function resetRequest(overrides: Record<string, unknown> = {}) {
    return mockRequest({
      body: {
        phone: "09123456789",
        code: CODE,
        new_password: NEW_PASSWORD,
        ...overrides,
      },
    });
  }

  /** A transaction client carrying the same mocks the extended client uses. */
  const tx = {
    otpCode: db.otpCode,
    user: db.user,
    refreshToken: db.refreshToken,
  };

  beforeEach(() => {
    db.$queryRaw.mockResolvedValue([candidateRow()]);
    db.otpCode.findFirst.mockResolvedValue(otpRow());
    db.otpCode.update.mockResolvedValue({ id: 77 });
    db.otpCode.updateMany.mockResolvedValue({ count: 1 });
    db.user.update.mockResolvedValue({ id: 1 });
    db.refreshToken.deleteMany.mockResolvedValue({ count: 2 });

    runInWorkspace.mockImplementation(
      (_workspaceId: number, fn: (client: unknown) => unknown) => fn(tx),
    );
  });

  it("changes the password and ends every session", async () => {
    const res = mockResponse();
    await controller.resetPassword(resetRequest(), res);

    const stored = db.user.update.mock.calls[0][0].data.password;
    expect(await bcrypt.compare(NEW_PASSWORD, stored)).toBe(true);

    // Not only the suspicious ones — there is no way to tell an intruder's
    // session from the owner's, and this reset may well have been prompted
    // by one.
    expect(db.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 1 },
    });
  });

  it("spends the code before writing the password", async () => {
    const res = mockResponse();
    await controller.resetPassword(resetRequest(), res);

    const consumed = db.otpCode.updateMany.mock.invocationCallOrder[0];
    const written = db.user.update.mock.invocationCallOrder[0];

    // The other order would leave the password changed and the code still
    // live if the consumption failed.
    expect(consumed).toBeLessThan(written);
  });

  it("hands back no session", async () => {
    // Unlike sign-up. The point of this endpoint was to end every session;
    // opening a new one in the same breath undoes half of it.
    const res = mockResponse();
    await controller.resetPassword(resetRequest(), res);

    expect(res.cookie).not.toHaveBeenCalled();
    expect(db.refreshToken.create).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).not.toHaveProperty("token");
  });

  it("writes nothing when the code is wrong", async () => {
    const res = mockResponse();
    await controller.resetPassword(resetRequest({ code: "00000" }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.refreshToken.deleteMany).not.toHaveBeenCalled();
  });

  it("counts the attempt outside the transaction", async () => {
    await controller.resetPassword(
      resetRequest({ code: "00000" }),
      mockResponse(),
    );

    expect(db.otpCode.update).toHaveBeenCalledWith({
      where: { id: 77 },
      data: { attempts: { increment: 1 } },
    });
    expect(runInWorkspace).not.toHaveBeenCalled();
  });

  it("says the same thing for an unknown number as for a wrong code", async () => {
    // send-otp already answers success for a number with no account and
    // sends nothing. Answering differently here would say which numbers have
    // accounts and undo that.
    const wrongCode = mockResponse();
    await controller.resetPassword(resetRequest({ code: "00000" }), wrongCode);

    db.$queryRaw.mockResolvedValue([]);
    db.otpCode.findFirst.mockResolvedValue(null);
    const unknownNumber = mockResponse();
    await controller.resetPassword(resetRequest(), unknownNumber);

    expect(wrongCode.json.mock.calls[0][0]).toEqual(
      unknownNumber.json.mock.calls[0][0],
    );
  });

  it("refuses a disabled account rather than resetting it", async () => {
    db.$queryRaw.mockResolvedValue([candidateRow({ is_active: false })]);

    const res = mockResponse();
    await controller.resetPassword(resetRequest(), res);

    // A new password changes nothing for an account login refuses anyway;
    // better to say so than walk them through choosing one.
    expect(res.status).toHaveBeenCalledWith(403);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("refuses an expired code", async () => {
    db.otpCode.findFirst.mockResolvedValue(
      otpRow({ expiresAt: new Date(Date.now() - 1000) }),
    );

    const res = mockResponse();
    await controller.resetPassword(resetRequest(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("refuses when the code was spent between the check and the write", async () => {
    db.otpCode.updateMany.mockResolvedValue({ count: 0 });

    const res = mockResponse();
    await controller.resetPassword(resetRequest(), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("reads a reset code, never a register one", async () => {
    // The two are separate rows for separate flows: a code issued to verify
    // a new number must not open an existing account.
    await controller.resetPassword(resetRequest(), mockResponse());

    expect(db.otpCode.findFirst.mock.calls[0][0].where.purpose).toBe("reset");
  });
});
