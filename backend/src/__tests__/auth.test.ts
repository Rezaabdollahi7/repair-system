import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET, authenticate } from "../middleware/auth";
import {
  currentWorkspaceId,
  runWithRequestContext,
} from "../lib/workspaceContext";

const WORKSPACE_ID = 3;

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

function mockRequest(authorization?: string) {
  return { headers: authorization ? { authorization } : {} } as Request;
}

/**
 * authenticate publishes the workspace into the async context, which needs
 * one already open — the requestContext middleware does that in production.
 */
function run(req: Request) {
  const res = mockResponse();
  const next = jest.fn() as NextFunction;

  return runWithRequestContext(() => {
    authenticate(req, res, next);
    return { res, next, context: currentWorkspaceId() };
  });
}

describe("authenticate", () => {
  it("accepts a well-formed token and passes it along", () => {
    const token = jwt.sign(validClaims(), JWT_SECRET);
    const req = mockRequest(`Bearer ${token}`);

    const { next, res } = run(req);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user).toMatchObject({ id: 1, workspaceId: WORKSPACE_ID });
  });

  it("publishes the workspace to the async context", () => {
    const token = jwt.sign(validClaims(), JWT_SECRET);

    // The Prisma extension reads it from there — req isn't reachable from
    // inside the client. Without this every tenant-scoped query throws.
    const { context } = run(mockRequest(`Bearer ${token}`));

    expect(context).toBe(WORKSPACE_ID);
  });

  it("refuses a request with no header", () => {
    const { res, next } = run(mockRequest());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "توکن یافت نشد" });
    expect(next).not.toHaveBeenCalled();
  });

  it("refuses a header that isn't a Bearer token", () => {
    const token = jwt.sign(validClaims(), JWT_SECRET);

    const { res } = run(mockRequest(`Basic ${token}`));

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("refuses a token signed with the wrong secret", () => {
    const forged = jwt.sign(validClaims(), "not-the-real-secret");

    const { res, next } = run(mockRequest(`Bearer ${forged}`));

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("refuses an expired token", () => {
    const token = jwt.sign(validClaims(), JWT_SECRET, { expiresIn: "-1s" });

    const { res } = run(mockRequest(`Bearer ${token}`));

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("refuses a token with no workspace, however validly signed", () => {
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

    const { res, next } = run(mockRequest(`Bearer ${token}`));

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    ["workspaceId", { workspaceId: "3" }],
    ["id", { id: "1" }],
    ["role", { role: 3 }],
    ["isActive", { isActive: "yes" }],
  ])("refuses a token whose %s is the wrong type", (_field, override) => {
    // jwt.verify proves who signed it, not what it contains.
    const token = jwt.sign(validClaims(override), JWT_SECRET);

    const { res } = run(mockRequest(`Bearer ${token}`));

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("says the same thing whether the token was forged or merely stale", () => {
    const forged = run(mockRequest(`Bearer ${jwt.sign({}, "wrong")}`));
    const stale = run(
      mockRequest(
        `Bearer ${jwt.sign(validClaims(), JWT_SECRET, { expiresIn: "-1s" })}`,
      ),
    );

    expect(forged.res.json.mock.calls[0][0]).toEqual(
      stale.res.json.mock.calls[0][0],
    );
  });
});
