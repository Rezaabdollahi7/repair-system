jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: {},
  runInWorkspaceTransaction: jest.fn(
    (_workspaceId: number, fn: (tx: unknown) => unknown) => fn(txMock),
  ),
}));

jest.mock("../lib/storage", () => ({
  __esModule: true,
  deleteByPrefix: jest.fn().mockResolvedValue(undefined),
  deleteObjects: jest.fn().mockResolvedValue(undefined),
}));

const deleted: string[] = [];

const txMock = new Proxy(
  {
    workspace: { update: jest.fn().mockResolvedValue({}) },
    deviceImage: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { filepath: "workspaces/99/devices/1/a.webp", thumbnailPath: null },
        ]),
      deleteMany: jest.fn(() => {
        deleted.push("deviceImage");
        return Promise.resolve({ count: 0 });
      }),
    },
    settings: {
      findFirst: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn(() => {
        deleted.push("settings");
        return Promise.resolve({ count: 0 });
      }),
    },
    backup: {
      findMany: jest.fn().mockResolvedValue([]),
      // ⚠️ Needed as well as findMany: an entry in this object shadows the
      // proxy's fallback entirely, so a model that is read AND deleted has to
      // carry both. That is what the seven failures above were.
      deleteMany: jest.fn(() => {
        deleted.push("backup");
        return Promise.resolve({ count: 0 });
      }),
    },
  } as Record<string, unknown>,
  {
    get(target, prop: string) {
      if (prop in target) {
        return target[prop];
      }

      return {
        deleteMany: jest.fn((args: { where: { workspaceId: number } }) => {
          deleted.push(prop);
          void args;
          return Promise.resolve({ count: 0 });
        }),
      };
    },
  },
);

import { deleteByPrefix, deleteObjects } from "../lib/storage";
import {
  DELETION_ORDER,
  deleteWorkspaceData,
} from "../utils/workspaceDeletion";

const WORKSPACE_ID = 12;
/**
 * The tombstone write, reached through the proxy.
 *
 * A function rather than a const: the proxy is built before the imports
 * below run, so reading it at module scope would capture it too early.
 */
function workspaceUpdate(): jest.Mock {
  return (txMock.workspace as { update: jest.Mock }).update;
}

beforeEach(() => {
  deleted.length = 0;
  jest.clearAllMocks();
  jest.mocked(deleteByPrefix).mockResolvedValue(undefined as never);
});

describe("deleteWorkspaceData", () => {
  it("empties every tenant table", async () => {
    await deleteWorkspaceData(WORKSPACE_ID);

    expect(deleted).toEqual([...DELETION_ORDER]);
  });

  it("clears invoice lines before the items they reference", async () => {
    // purchase_invoice_items and sale_invoice_items reference items with
    // Restrict, so the reverse order fails halfway through with a foreign
    // key error — half the data gone and half still there.
    await deleteWorkspaceData(WORKSPACE_ID);

    expect(deleted.indexOf("purchaseInvoiceItem")).toBeLessThan(
      deleted.indexOf("item"),
    );
    expect(deleted.indexOf("saleInvoiceItem")).toBeLessThan(
      deleted.indexOf("item"),
    );
  });

  it("clears repair invoices before the devices they point at", async () => {
    // repair_invoices.deviceId is NOT NULL with Restrict.
    expect(DELETION_ORDER.indexOf("repairInvoice")).toBeLessThan(
      DELETION_ORDER.indexOf("device"),
    );
  });

  it("leaves the ledger alone", async () => {
    // The workspace row survives precisely so payments can keep pointing at
    // it. Removing any of these would defeat that.
    for (const spared of [
      "payment",
      "subscriptionEvent",
      "discountCodeUse",
      "referral",
    ]) {
      expect(deleted).not.toContain(spared);
    }
  });

  it("removes the objects before the rows", async () => {
    // The reverse leaves photographs nothing points at, paid for
    // indefinitely — and storage is the cost that never comes back down.
    await deleteWorkspaceData(WORKSPACE_ID);

    const objectOrder = jest.mocked(deleteByPrefix).mock.invocationCallOrder[0];
    const rowOrder = workspaceUpdate().mock.invocationCallOrder[0];

    expect(objectOrder).toBeLessThan(rowOrder);
  });

  it("takes both prefixes", async () => {
    await deleteWorkspaceData(WORKSPACE_ID);

    expect(jest.mocked(deleteByPrefix).mock.calls.map((c) => c[0])).toEqual([
      `workspaces/${WORKSPACE_ID}/`,
      `exports/${WORKSPACE_ID}/`,
    ]);
  });

  it("carries on when the bucket cannot be reached", async () => {
    // An orphaned object wastes kilobytes; a thrown error leaves a workspace
    // nobody can finish removing.
    jest.mocked(deleteByPrefix).mockRejectedValue(new Error("network"));
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});

    await deleteWorkspaceData(WORKSPACE_ID);

    expect(deleted).toEqual([...DELETION_ORDER]);
    expect(logged).toHaveBeenCalled();

    logged.mockRestore();
  });

  it("leaves a tombstone rather than a hole", async () => {
    await deleteWorkspaceData(WORKSPACE_ID);

    expect(workspaceUpdate().mock.calls[0][0]).toMatchObject({
      where: { id: WORKSPACE_ID },
      data: expect.objectContaining({
        status: "deleted",
        purchaseSeq: 0,
        saleSeq: 0,
        repairSeq: 0,
      }),
    });
  });

  it("reads the keys off the rows before deleting them", async () => {
    // A workspace restored under a new id keeps object keys with the old
    // prefix — filepath stores the full key and is signed as-is — so the
    // sweep alone would walk right past its photographs.
    await deleteWorkspaceData(WORKSPACE_ID);

    expect(jest.mocked(deleteObjects).mock.calls[0][0]).toContain(
      "workspaces/99/devices/1/a.webp",
    );
  });
});
