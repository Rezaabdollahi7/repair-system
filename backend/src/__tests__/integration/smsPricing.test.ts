import prisma from "../../lib/prisma";
import { runWithWorkspace } from "../../lib/workspaceContext";
import { currentUnitPriceRials, priceMessage } from "../../utils/smsPricing";
import {
  disconnectOwner,
  owner,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

// Against a real database because the question is which row wins, and that
// is a query rather than a calculation. countSegments and priceFor are pure
// and tested in the mocked suite.

let workspaces: TwoWorkspaces;

const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
});

afterAll(async () => {
  await disconnectOwner();
  await prisma.$disconnect();
});

/**
 * sms_prices is reference data inserted by the 12.1 migration, and
 * truncateAll empties every table — so by the time a test runs the opening
 * row is gone, exactly as plans and roles are. Recreated here rather than
 * exempted from the truncation, which would leave one table carrying state
 * between tests.
 */
function seedPrices(rows: { unitPriceRials: number; daysAgo: number }[]) {
  return owner.smsPrice.createMany({
    data: rows.map((row) => ({
      unitPriceRials: row.unitPriceRials,
      effectiveFrom: new Date(Date.now() - row.daysAgo * DAY),
    })),
  });
}

const read = () =>
  runWithWorkspace(workspaces.a.workspaceId, async () =>
    currentUnitPriceRials(),
  );

describe("currentUnitPriceRials", () => {
  it("takes the most recent price that has already started", async () => {
    await seedPrices([
      { unitPriceRials: 1_750, daysAgo: 90 },
      { unitPriceRials: 2_500, daysAgo: 10 },
    ]);

    expect(await read()).toBe(2_500);
  });

  it("ignores a price that starts in the future", async () => {
    // A rise can be entered ahead of time without changing what today costs.
    // Without the `lte` this would take the new price early, and every shop
    // would be charged for a change that had not happened.
    await seedPrices([
      { unitPriceRials: 1_750, daysAgo: 30 },
      { unitPriceRials: 4_000, daysAgo: -7 },
    ]);

    expect(await read()).toBe(1_750);
  });

  it("refuses to price a message when no price is in force", async () => {
    // A missing price must not become a free message. That is the failure
    // nobody notices until the provider's bill arrives.
    await expect(read()).rejects.toThrow(/No SMS price is in force/);
  });

  it("is readable by a workspace but not writable", async () => {
    // Reference data, like plans: every shop pays the same, and the price is
    // set with psql. The grant is asserted in isolationSpecialCases; this is
    // the half that matters to pricing — a workspace can read what it will
    // be charged.
    await seedPrices([{ unitPriceRials: 1_750, daysAgo: 1 }]);

    expect(await read()).toBe(1_750);
    await expect(
      runWithWorkspace(workspaces.b.workspaceId, async () =>
        currentUnitPriceRials(),
      ),
    ).resolves.toBe(1_750);
  });
});

describe("a price change does not reach into the past", () => {
  it("leaves yesterday's messages costing yesterday's price", async () => {
    // The scenario from §30, and the reason `unitPriceRials` and `costRials`
    // are columns on sms_messages rather than a join to sms_prices. A shop
    // that opens «پیامک‌های ارسالی» after a rise must see what it actually
    // paid; a history that re-renders at today's price is not a history,
    // and it would not reconcile against the ledger either — the ledger
    // rows are amounts, and they do not move.
    await seedPrices([{ unitPriceRials: 1_750, daysAgo: 30 }]);

    const yesterday = await runWithWorkspace(
      workspaces.a.workspaceId,
      async () => await priceMessage("سلام"),
    );
    expect(yesterday.unitPriceRials).toBe(1_750);

    const row = await owner.smsMessage.create({
      data: {
        workspaceId: workspaces.a.workspaceId,
        phone: "09121234567",
        kind: "device_ready",
        status: "sent",
        segments: yesterday.segments,
        unitPriceRials: yesterday.unitPriceRials,
        costRials: yesterday.costRials,
      },
      select: { id: true },
    });

    // The rise lands today, on top of the old row rather than instead of it.
    // Half a day back rather than 0: `effective_from <= now()` is evaluated
    // in Postgres a moment after the row is written, and a price stamped at
    // exactly Date.now() would be racing that gap on every run.
    await seedPrices([{ unitPriceRials: 2_500, daysAgo: 0.5 }]);

    const today = await runWithWorkspace(
      workspaces.a.workspaceId,
      async () => await priceMessage("سلام"),
    );
    expect(today.unitPriceRials).toBe(2_500);

    const stored = await owner.smsMessage.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(stored.unitPriceRials.toNumber()).toBe(1_750);
    expect(stored.costRials.toNumber()).toBe(yesterday.costRials);
  });

  it("charges a message at the price in force when it is sent", async () => {
    // The other half: a new price does take effect, immediately and without
    // anything being restarted. Both halves are needed — a snapshot that
    // never refreshes and a lookup that rewrites history are the same bug
    // seen from two sides.
    await seedPrices([
      { unitPriceRials: 1_750, daysAgo: 30 },
      { unitPriceRials: 2_500, daysAgo: 1 },
    ]);

    const priced = await runWithWorkspace(
      workspaces.a.workspaceId,
      async () => await priceMessage("سلام"),
    );

    expect(priced.unitPriceRials).toBe(2_500);
    expect(priced.costRials).toBe(2_500 * priced.segments);
  });
});
