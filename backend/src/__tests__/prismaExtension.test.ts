import prisma, { runInWorkspaceTransaction } from "../lib/prisma";
import { runWithRequestContext } from "../lib/workspaceContext";

// Deliberately unmocked, unlike every controller test: the point is the real
// extension. No connection is opened — the guard below rejects before any
// query reaches the driver, and DATABASE_URL_APP is pinned to a throwaway
// value in jest.setup.ts purely so the module can be imported.
//
// What this file cannot prove is the other half: that a query issued WITH a
// workspace actually arrives at Postgres carrying it. That needs a real
// database and belongs to the isolation tests in task 2.7.

describe("the Prisma client extension", () => {
  it("refuses a model query with no request context", async () => {
    // Left to RLS this would return an empty result and no error — a bug
    // found weeks later by a customer rather than now by whoever wrote it.
    await expect(prisma.customer.findMany()).rejects.toThrow(
      /No workspace context/,
    );
  });

  it("refuses a model query inside an unauthenticated request", async () => {
    await runWithRequestContext(async () => {
      await expect(prisma.device.count()).rejects.toThrow(
        /No workspace context/,
      );
    });
  });

  it("points at the transaction helper in its message", async () => {
    // The likeliest way to hit this error is an interactive transaction that
    // still goes through the extended client, so the message names the fix.
    await expect(prisma.item.findFirst()).rejects.toThrow(
      /runInWorkspaceTransaction/,
    );
  });
  it("takes the workspace as an argument rather than from the context", () => {
    // The helper runs on the unextended client, so it can't read the async
    // context — the caller passes the workspace from the verified token.
    expect(runInWorkspaceTransaction).toHaveLength(2);
  });

  // OtpCode is the one model exempt from the guard: a verification code is
  // sent before any workspace exists (OTP.1), so there is no id to demand.
  describe("the OtpCode exemption", () => {
    it("lets otpCode through without a workspace", async () => {
      // Asserted as "not the guard" rather than "succeeds": with the
      // exemption in place the query reaches the driver, and the connection
      // string here is a throwaway, so it fails at the socket instead. Any
      // error EXCEPT the guard's is what this test is looking for.
      await expect(prisma.otpCode.findMany()).rejects.not.toThrow(
        /No workspace context/,
      );
    });

    it("exempts otpCode alone", async () => {
      // The half that matters more. A predicate written slightly wrong —
      // inverted, or matching a prefix — would take every model out from
      // under the guard, and nothing else in this suite would notice,
      // because a query that no longer throws simply returns rows.
      await expect(prisma.otpCode.count()).rejects.not.toThrow(
        /No workspace context/,
      );

      await expect(prisma.customer.findMany()).rejects.toThrow(
        /No workspace context/,
      );
      await expect(prisma.refreshToken.findMany()).rejects.toThrow(
        /No workspace context/,
      );
    });
  });
});
