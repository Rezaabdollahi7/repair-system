import type { NextFunction, Request, Response } from "express";

jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: { workspace: { findUnique: jest.fn() } },
}));

import prisma from "../lib/prisma";
import { mayWrite, requireWriteAccess } from "../middleware/subscription";
import { GRACE_DAYS } from "../utils/subscription";

const WORKSPACE_ID = 4;
const DAY = 24 * 60 * 60 * 1000;

function daysFromNow(days: number) {
  return new Date(Date.now() + days * DAY);
}

describe("mayWrite", () => {
  it("allows a live subscription", () => {
    expect(
      mayWrite({ neverExpires: false, expiresAt: daysFromNow(10) }),
    ).toBe(true);
  });

  it("allows the grace period, and stops at the end of it", () => {
    // Days 0 to 3 past expiry: the shop keeps working and sees a banner.
    // Cards fail often enough here that cutting someone off at the exact
    // minute turns a customer mid-payment into a customer who gave up.
    expect(
      mayWrite({ neverExpires: false, expiresAt: daysFromNow(-1) }),
    ).toBe(true);

    expect(
      mayWrite({
        neverExpires: false,
        expiresAt: daysFromNow(-(GRACE_DAYS + 1)),
      }),
    ).toBe(false);
  });

  it("never expires the workspaces flagged that way", () => {
    // Ours and any demo account. The flag has no route and no schema
    // validation anywhere — it is set with psql and nothing else.
    expect(
      mayWrite({ neverExpires: true, expiresAt: daysFromNow(-500) }),
    ).toBe(true);
  });

  it("treats a missing expiry as expired, not as forever", () => {
    // No workspace should reach the outside world without one —
    // app_create_workspace and startTrial run in the same transaction — but
    // "no answer to until when" has to fail closed if one ever does.
    expect(mayWrite({ neverExpires: false, expiresAt: null })).toBe(false);
  });
});

describe("requireWriteAccess", () => {
  function mockRes() {
    const res = {} as Response & { status: jest.Mock; json: jest.Mock };
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }

  function mockReq(overrides: Partial<Request> = {}): Request {
    return {
      method: "POST",
      baseUrl: "/api/devices",
      path: "/",
      user: { workspaceId: WORKSPACE_ID },
      ...overrides,
    } as Request;
  }

  async function run(req: Request) {
    const res = mockRes();
    const next = jest.fn() as NextFunction;
    await requireWriteAccess(req, res, next);
    return { res, next };
  }

  function subscriptionIs(expiresAt: Date | null, neverExpires = false) {
    jest
      .mocked(prisma.workspace.findUnique)
      .mockResolvedValue({ neverExpires, expiresAt } as never);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    subscriptionIs(daysFromNow(-30));
  });

  it.each(["GET", "HEAD", "OPTIONS"])(
    "lets %s through without asking anything",
    async (method) => {
      const { next, res } = await run(mockReq({ method }));

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(prisma.workspace.findUnique).not.toHaveBeenCalled();
    },
  );

  it("refuses a write with 402 and a code the frontend can branch on", async () => {
    const { next, res } = await run(mockReq());

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "subscription_expired" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("lets a lapsed workspace change its password", async () => {
    // The owner trying to get back in to pay must not be locked out of their
    // own account first.
    const { next, res } = await run(
      mockReq({
        method: "PUT",
        baseUrl: "/api/auth",
        path: "/change-password",
      }),
    );

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("lets a lapsed workspace reach the payment routes", async () => {
    const { next } = await run(
      mockReq({ baseUrl: "/api/subscription", path: "/checkout" }),
    );

    expect(next).toHaveBeenCalled();
  });

  it("joins baseUrl and path rather than reading either alone", async () => {
    // ⚠️ The single most breakable line in this middleware. Inside a router
    // mounted twice over, req.path is relative to the innermost mount:
    // /api/auth/change-password arrives as path "/change-password". Matching
    // that alone would open any route in any router that ever shared the
    // name — so a settings router with its own /change-password would be
    // silently exempt.
    const { next, res } = await run(
      mockReq({ baseUrl: "/api/settings", path: "/change-password" }),
    );

    expect(res.status).toHaveBeenCalledWith(402);
    expect(next).not.toHaveBeenCalled();
  });

  it("checks a request whose path it cannot read", async () => {
    // A path this middleware cannot read is not a path it can declare open.
    const { res } = await run(
      mockReq({ baseUrl: undefined, path: undefined }),
    );

    expect(res.status).toHaveBeenCalledWith(402);
  });

  it("closes settings, which is a product to edit rather than a way to pay", async () => {
    const { res } = await run(
      mockReq({ method: "PUT", baseUrl: "/api/settings", path: "/" }),
    );

    expect(res.status).toHaveBeenCalledWith(402);
  });

  it("closes new exports while its downloads stay open", async () => {
    const created = await run(mockReq({ baseUrl: "/api/exports", path: "/" }));
    expect(created.res.status).toHaveBeenCalledWith(402);

    // A shop that stopped paying can still take its data with it: refusing
    // that reads as holding the data hostage, and costs more in reputation
    // than the export costs in CPU.
    const download = await run(
      mockReq({
        method: "GET",
        baseUrl: "/api/exports",
        path: "/7/download",
      }),
    );
    expect(download.next).toHaveBeenCalled();
  });

  it("allows the write when the subscription is live", async () => {
    subscriptionIs(daysFromNow(30));

    const { next, res } = await run(mockReq());

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("refuses rather than guessing when the row is not there", async () => {
    // RLS returning nothing for the caller's own workspace should be
    // impossible — the context came from the same token. If it happens it is
    // a bug in the context chain, and refusing is the safe reading.
    jest.mocked(prisma.workspace.findUnique).mockResolvedValue(null as never);
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});

    const { res, next } = await run(mockReq());

    expect(res.status).toHaveBeenCalledWith(402);
    expect(next).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalled();

    logged.mockRestore();
  });
});
