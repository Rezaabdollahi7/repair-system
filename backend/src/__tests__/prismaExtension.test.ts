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
});
