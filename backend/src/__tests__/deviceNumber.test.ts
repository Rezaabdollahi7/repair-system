import { nextReceptionNumber } from "../utils/deviceNumber";
import type { Prisma } from "../generated/prisma/client";

/**
 * What a mocked test can prove here is narrow, and worth being explicit
 * about: that the counter is moved with an atomic increment on the right
 * workspace, and that the number returned is the one the database handed
 * back rather than anything computed on this side.
 *
 * What it cannot prove is the part that matters most — that two concurrent
 * callers get different numbers. That guarantee lives in the row lock
 * Postgres takes for the UPDATE, which no mock ever reaches. It is tested in
 * integration, against a real database, exactly as invoice numbering is.
 */
describe("nextReceptionNumber", () => {
  const makeTx = (deviceSeq: number) => {
    const update = jest.fn().mockResolvedValue({ deviceSeq });
    return {
      tx: { workspace: { update } } as unknown as Prisma.TransactionClient,
      update,
    };
  };

  it("returns the value the database wrote, not a locally computed one", async () => {
    const { tx } = makeTx(7);

    await expect(nextReceptionNumber(tx, 1)).resolves.toBe(7);
  });

  it("increments rather than reading and writing back", async () => {
    const { tx, update } = makeTx(1);

    await nextReceptionNumber(tx, 42);

    // `increment` is what compiles to `seq = seq + 1` and takes the row
    // lock. A `set` here would be a read-then-write, which is the race this
    // function exists to avoid.
    expect(update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { deviceSeq: { increment: 1 } },
      select: { deviceSeq: true },
    });
  });

  it("starts a workspace's first device at 1", async () => {
    // The migration leaves device_seq at 0 for a workspace with no devices,
    // so the first increment hands out 1 — not 0, and not a number that
    // depends on any other workspace.
    const { tx } = makeTx(1);

    await expect(nextReceptionNumber(tx, 9)).resolves.toBe(1);
  });
});
