import prisma, { runInWorkspaceTransaction } from "../../lib/prisma";
import {
  creditWallet,
  debitWallet,
  isDuplicateRefund,
  refundMessage,
} from "../../utils/smsWallet";
import {
  disconnectOwner,
  owner,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

// Against a real database, because the guarantee this module exists for
// lives in Postgres rather than in the code. A mocked test can assert the
// shape of the SQL — smsWallet.test.ts does — but only a real row lock can
// show that two callers cannot both spend the same credit.

let workspaces: TwoWorkspaces;
const COST = 3_500;

async function walletBalance(workspaceId: number): Promise<number> {
  const wallet = await owner.smsWallet.findUniqueOrThrow({
    where: { workspaceId },
  });

  return wallet.balanceRials.toNumber();
}

/** A message row to hang a debit on, since the ledger points at one. */
async function newMessage(workspaceId: number): Promise<number> {
  const row = await owner.smsMessage.create({
    data: {
      workspaceId,
      phone: "09120000010",
      kind: "device_ready",
      unitPriceRials: 1_750,
      segments: 2,
      costRials: COST,
    },
    select: { id: true },
  });

  return row.id;
}

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
});

afterAll(async () => {
  await disconnectOwner();
  await prisma.$disconnect();
});

describe("debitWallet under concurrency", () => {
  it("lets exactly one of two simultaneous sends through", async () => {
    // The scenario from the brief: one workshop, two users, 500 toman of
    // credit and two messages at 350. Reading the balance in JavaScript and
    // deciding there would let both through and leave the wallet at −200.
    const workspaceId = workspaces.a.workspaceId;

    await owner.smsWallet.create({
      data: { workspaceId, balanceRials: 5_000 },
    });

    const [first, second] = await Promise.all([
      newMessage(workspaceId),
      newMessage(workspaceId),
    ]);

    const results = await Promise.all(
      [first, second].map((smsMessageId) =>
        runInWorkspaceTransaction(workspaceId, (tx) =>
          debitWallet(tx, workspaceId, { costRials: COST, smsMessageId }),
        ),
      ),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);

    // 5,000 − 3,500. Never 5,000 − 7,000.
    expect(await walletBalance(workspaceId)).toBe(1_500);

    // And the refusal left no row behind: nothing was charged, so nothing
    // should be recorded as having been.
    const ledger = await owner.smsWalletTransaction.findMany({
      where: { workspaceId },
    });
    expect(ledger).toHaveLength(1);
  });

  it("never goes below zero however many callers arrive at once", async () => {
    // Six sends against credit for two. The arithmetic is the same as above,
    // but a single pair can pass by luck of scheduling — six cannot. Six
    // rather than more because each is an interactive transaction holding a
    // connection, and the pool has ten.
    const workspaceId = workspaces.a.workspaceId;

    await owner.smsWallet.create({
      data: { workspaceId, balanceRials: COST * 2 },
    });

    const ids = await Promise.all(
      Array.from({ length: 6 }, () => newMessage(workspaceId)),
    );

    const results = await Promise.all(
      ids.map((smsMessageId) =>
        runInWorkspaceTransaction(workspaceId, (tx) =>
          debitWallet(tx, workspaceId, { costRials: COST, smsMessageId }),
        ),
      ),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(await walletBalance(workspaceId)).toBe(0);
  });

  it("keeps the balance equal to the sum of its rows", async () => {
    // The column and the ledger are two answers to one question. This is the
    // assertion that they agree — and the reason the ledger has no UPDATE or
    // DELETE grant, so the sum cannot be quietly rewritten to match.
    const workspaceId = workspaces.a.workspaceId;

    await owner.smsWallet.create({ data: { workspaceId, balanceRials: 0 } });

    await runInWorkspaceTransaction(workspaceId, (tx) =>
      creditWallet(tx, workspaceId, { amountRials: 200_000, type: "topup" }),
    );

    for (const smsMessageId of await Promise.all(
      Array.from({ length: 4 }, () => newMessage(workspaceId)),
    )) {
      await runInWorkspaceTransaction(workspaceId, (tx) =>
        debitWallet(tx, workspaceId, { costRials: COST, smsMessageId }),
      );
    }

    const rows = await owner.smsWalletTransaction.findMany({
      where: { workspaceId },
    });
    const summed = rows.reduce((total, row) => total + row.amountRials.toNumber(), 0);

    expect(summed).toBe(200_000 - COST * 4);
    expect(await walletBalance(workspaceId)).toBe(summed);
  });
});

describe("refundMessage", () => {
  it("gives back exactly what was taken", async () => {
    const workspaceId = workspaces.a.workspaceId;

    await owner.smsWallet.create({
      data: { workspaceId, balanceRials: 100_000 },
    });
    const smsMessageId = await newMessage(workspaceId);

    await runInWorkspaceTransaction(workspaceId, (tx) =>
      debitWallet(tx, workspaceId, { costRials: COST, smsMessageId }),
    );
    expect(await walletBalance(workspaceId)).toBe(96_500);

    await runInWorkspaceTransaction(workspaceId, (tx) =>
      refundMessage(tx, workspaceId, { smsMessageId, amountRials: COST }),
    );

    expect(await walletBalance(workspaceId)).toBe(100_000);
  });

  it("credits once however many times the refund is retried", async () => {
    // The case the unique index exists for: a retry, a second cron pass, a
    // caller that did not know the first attempt had landed.
    const workspaceId = workspaces.a.workspaceId;

    await owner.smsWallet.create({
      data: { workspaceId, balanceRials: 100_000 },
    });
    const smsMessageId = await newMessage(workspaceId);

    await runInWorkspaceTransaction(workspaceId, (tx) =>
      debitWallet(tx, workspaceId, { costRials: COST, smsMessageId }),
    );

    const refund = () =>
      runInWorkspaceTransaction(workspaceId, (tx) =>
        refundMessage(tx, workspaceId, { smsMessageId, amountRials: COST }),
      );

    await refund();

    // The second attempt must fail, and must fail having changed nothing —
    // the INSERT aborts the transaction and the credit goes with it.
    const error = await refund().then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(isDuplicateRefund(error)).toBe(true);

    expect(await walletBalance(workspaceId)).toBe(100_000);
    expect(
      await owner.smsWalletTransaction.count({
        where: { workspaceId, type: "refund" },
      }),
    ).toBe(1);
  });
});

describe("wallets belong to one workspace", () => {
  it("will not spend another workspace's credit", async () => {
    // The shape of the real mistake: a controller that took the workspace
    // from the request body instead of the token would call this with
    // somebody else's id while running in its own context.
    //
    // Both workspaces get a wallet, so a pass here cannot be explained by
    // the caller simply not having one — which is what an earlier version of
    // this test was actually asserting.
    for (const workspaceId of [
      workspaces.a.workspaceId,
      workspaces.b.workspaceId,
    ]) {
      await owner.smsWallet.create({
        data: { workspaceId, balanceRials: 500_000 },
      });
    }

    const smsMessageId = await newMessage(workspaces.b.workspaceId);

    // Running as A, asking to debit B. The UPDATE names B in its WHERE and
    // the policy scopes the statement to A, so it matches nothing — and the
    // existence check that follows is scoped the same way, so the engine
    // reports a missing wallet rather than an empty one.
    await expect(
      runInWorkspaceTransaction(workspaces.a.workspaceId, (tx) =>
        debitWallet(tx, workspaces.b.workspaceId, {
          costRials: COST,
          smsMessageId,
        }),
      ),
    ).rejects.toThrow(/no SMS wallet row/);

    expect(await walletBalance(workspaces.b.workspaceId)).toBe(500_000);
    expect(await walletBalance(workspaces.a.workspaceId)).toBe(500_000);
  });
});
