import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET, authenticate } from "../middleware/auth";
import {
  currentWorkspaceId,
  runWithRequestContext,
} from "../lib/workspaceContext";

// authenticate ends by calling requireWriteAccess (8.3), which reads the
// workspace's expiry. Mocked rather than left to reach a real database: this
// suite is about what a token says, and a live query here would make every
// test below depend on Postgres being up.
jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: { workspace: { findUnique: jest.fn() } },
}));

import prisma from "../lib/prisma";

const WORKSPACE_ID = 3;
const DAY = 24 * 60 * 60 * 1000;

/**
 * A live subscription unless a test says otherwise.
 *
 * Not null: a null expiry reads as expired, which is the right default in
 * production and the wrong one here — it would turn every write in this file
 * into a 402 and hide whatever was actually being tested.
 */
const LIVE = { neverExpires: false, expiresAt: new Date(Date.now() + 30 * DAY) };

/** Past the three-day grace period, so writes are refused. */
const LAPSED = { neverExpires: false, expiresAt: new Date(Date.now() - 5 * DAY) };

function subscriptionIs(workspace: typeof LIVE) {
  jest.mocked(prisma.workspace.findUnique).mockResolvedValue(workspace as never);
}

beforeEach(() => {
  subscriptionIs(LIVE);
});

function validClaims(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    workspaceId: WORKSPACE_ID,
    username: "09123456789",
    role: "super_admin",
    isActive: true,
    ...overrides,
  };
}

function mockResponse() {
  const res = {} as Response & { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

/**
 * method and path matter now: the subscription guard reads baseUrl + path to
 * decide whether a route is one of the few that stay open to a lapsed
 * workspace, and waves every GET through untouched. GET is the default so
 * the token tests below stay about tokens.
 */
function mockRequest(
  authorization?: string,
  overrides: Partial<Request> = {},
): Request {
  return {
    headers: authorization ? { authorization } : {},
    method: "GET",
    baseUrl: "/api/devices",
    path: "/",
    ...overrides,
  } as Request;
}

/**
 * authenticate publishes the workspace into the async context, which needs
 * one already open — the requestContext middleware does that in production.
 *
 * Awaited: authenticate became async in 8.3, and a floating promise would
 * let each test assert before the guard had finished, passing or failing by
 * timing rather than by behaviour.
 */
async function run(req: Request) {
  const res = mockResponse();
  const next = jest.fn() as NextFunction;

  return runWithRequestContext(async () => {
    await authenticate(req, res, next);
    return { res, next, context: currentWorkspaceId() };
  });
}

describe("authenticate", () => {
  it("accepts a well-formed token and passes it along", async () => {
    const token = jwt.sign(validClaims(), JWT_SECRET);
    const req = mockRequest(`Bearer ${token}`);

    const { next, res } = await run(req);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user).toMatchObject({ id: 1, workspaceId: WORKSPACE_ID });
  });

  it("publishes the workspace to the async context", async () => {
    const token = jwt.sign(validClaims(), JWT_SECRET);

    // The Prisma extension reads it from there — req isn't reachable from
    // inside the client. Without this every tenant-scoped query throws.
    const { context } = await run(mockRequest(`Bearer ${token}`));

    expect(context).toBe(WORKSPACE_ID);
  });

  it("refuses a request with no header", async () => {
    const { res, next } = await run(mockRequest());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "توکن یافت نشد" });
    expect(next).not.toHaveBeenCalled();
  });

  it("refuses a header that isn't a Bearer token", async () => {
    const token = jwt.sign(validClaims(), JWT_SECRET);

    const { res } = await run(mockRequest(`Basic ${token}`));

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("refuses a token signed with the wrong secret", async () => {
    const forged = jwt.sign(validClaims(), "not-the-real-secret");

    const { res, next } = await run(mockRequest(`Bearer ${forged}`));

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("refuses an expired token", async () => {
    const token = jwt.sign(validClaims(), JWT_SECRET, { expiresIn: "-1s" });

    const { res } = await run(mockRequest(`Bearer ${token}`));

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("refuses a token with no workspace, however validly signed", async () => {
    // Tokens predating multi-tenancy are signed just as validly. Letting one
    // through would reach a handler that throws for a missing workspace,
    // surfacing as a 500 rather than a prompt to sign in again.
    const withoutWorkspace = {
      id: 1,
      username: "09123456789",
      role: "super_admin",
      isActive: true,
    };
    const token = jwt.sign(withoutWorkspace, JWT_SECRET);

    const { res, next } = await run(mockRequest(`Bearer ${token}`));

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    ["workspaceId", { workspaceId: "3" }],
    ["id", { id: "1" }],
    ["role", { role: 3 }],
    ["isActive", { isActive: "yes" }],
  ])(
    "refuses a token whose %s is the wrong type",
    async (_field, override) => {
      // jwt.verify proves who signed it, not what it contains.
      const token = jwt.sign(validClaims(override), JWT_SECRET);

      const { res } = await run(mockRequest(`Bearer ${token}`));

      expect(res.status).toHaveBeenCalledWith(401);
    },
  );

  it("says the same thing whether the token was forged or merely stale", async () => {
    const forged = await run(mockRequest(`Bearer ${jwt.sign({}, "wrong")}`));
    const stale = await run(
      mockRequest(
        `Bearer ${jwt.sign(validClaims(), JWT_SECRET, { expiresIn: "-1s" })}`,
      ),
    );

    expect(forged.res.json.mock.calls[0][0]).toEqual(
      stale.res.json.mock.calls[0][0],
    );
  });
});

// The guard has its own suite for its own rules; these are here because it
// runs as part of authenticate, and that wiring is what nothing else covers.
describe("the subscription guard runs as part of authenticate", () => {
  function tokenRequest(overrides: Partial<Request> = {}) {
    return mockRequest(`Bearer ${jwt.sign(validClaims(), JWT_SECRET)}`, overrides);
  }

  it("refuses a write from a workspace whose subscription ran out", async () => {
    subscriptionIs(LAPSED);

    const { res, next } = await run(tokenRequest({ method: "POST" }));

    // 402, not 403: expired is not forbidden, and the frontend shows a
    // different screen for each.
    expect(res.status).toHaveBeenCalledWith(402);
    expect(next).not.toHaveBeenCalled();
  });

  it("still lets that workspace read everything it had", async () => {
    subscriptionIs(LAPSED);

    const { res, next } = await run(tokenRequest());

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("does not ask the database at all on a read", async () => {
    // Reads are the majority of requests and the guard has nothing to say
    // about them, so they must not each cost a round trip — which, with RLS,
    // is two.
    await run(tokenRequest());

    expect(prisma.workspace.findUnique).not.toHaveBeenCalled();
  });

  it("checks the workspace from the token, never one from the request", async () => {
    await run(tokenRequest({ method: "POST" }));

    expect(prisma.workspace.findUnique).toHaveBeenCalledWith({
      where: { id: WORKSPACE_ID },
      select: { neverExpires: true, expiresAt: true },
    });
  });
});
