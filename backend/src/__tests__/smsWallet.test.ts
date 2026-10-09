import {
  creditWallet,
  debitWallet,
  isDuplicateRefund,
  ledgerLine,
  refundMessage,
} from "../utils/smsWallet";

// A hand-rolled transaction client rather than a mock of lib/prisma: these
// functions take their tx as an argument, so there is nothing to intercept
// and the test can say exactly what the database returned. Same shape as
// subscription.test.ts.
//
// `balanceAfter` is what the conditional UPDATE would return — null stands
// for "matched no row", which is how Postgres reports both a refusal and a
// missing wallet.
function makeTx(
  balanceAfter: number | null,
  wallet: { balanceRials: number } | null = { balanceRials: 0 },
) {
  const decimal = (value: number) => ({ toNumber: () => value });

  return {
    $queryRaw: jest
      .fn()
      .mockResolvedValue(
        balanceAfter === null ? [] : [{ balance_rials: String(balanceAfter) }],
      ),
    smsWallet: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          wallet === null
            ? null
            : { balanceRials: decimal(wallet.balanceRials) },
        ),
    },
    smsWalletTransaction: {
      create: jest.fn().mockResolvedValue({ id: 77 }),
    },
  };
}

describe("ledgerLine", () => {
  it("derives the opening balance from the closing one", () => {
    // The database returns only what the balance became; the row has to
    // carry both ends so it reads on its own without replaying the table.
    expect(ledgerLine(96_500, -3_500)).toEqual({
      amountRials: -3_500,
      balanceBeforeRials: 100_000,
      balanceAfterRials: 96_500,
    });
  });

  it("keeps the sign, so the balance is the sum of its rows", () => {
    expect(ledgerLine(100_000, 100_000).balanceBeforeRials).toBe(0);
    expect(ledgerLine(100_000, 100_000).amountRials).toBe(100_000);
  });

  it("refuses a movement of zero", () => {
    expect(() => ledgerLine(1_000, 0)).toThrow(/non-zero/);
  });

  it("refuses a fraction of a rial", () => {
    // Either somebody is holding tomans, or floating point has got into a
    // column the schema declares as Decimal(18,0).
    expect(() => ledgerLine(1_000, -3.5)).toThrow(/whole number/);
  });

  it("refuses a line that implies a negative balance at either end", () => {
    expect(() => ledgerLine(-100, -3_500)).toThrow(/cannot be negative/);
    expect(() => ledgerLine(1_000, 2_000)).toThrow(/cannot be negative/);
  });
});

describe("debitWallet", () => {
  const input = { costRials: 3_500, smsMessageId: 5 };

  it("writes a ledger row with both ends of the movement", async () => {
    const tx = makeTx(96_500);

    const result = await debitWallet(tx as never, 7, input);

    expect(result).toEqual({
      ok: true,
      balanceAfterRials: 96_500,
      transactionId: 77,
    });
    expect(tx.smsWalletTransaction.create.mock.calls[0][0].data).toMatchObject({
      workspaceId: 7,
      type: "send",
      smsMessageId: 5,
      amountRials: -3_500,
      balanceBeforeRials: 100_000,
      balanceAfterRials: 96_500,
    });
  });

  it("checks the balance and subtracts it in one statement", async () => {
    // The whole point of the design. If this ever becomes a read followed by
    // a write, two users of one workshop can both pass the check and the
    // balance goes negative — so the test asserts the shape of the SQL, not
    // just its result.
    const tx = makeTx(96_500);
    await debitWallet(tx as never, 7, input);

    const sql = tx.$queryRaw.mock.calls[0][0].join("?");

    expect(sql).toMatch(/UPDATE sms_wallets/);
    expect(sql).toMatch(/balance_rials >=/);
    expect(sql).toMatch(/RETURNING balance_rials/);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("refuses rather than throwing when the credit will not cover it", async () => {
    // An ordinary outcome the caller records as a message status, not an
    // error to catch and inspect.
    const tx = makeTx(null, { balanceRials: 2_000 });

    const result = await debitWallet(tx as never, 7, input);

    expect(result).toEqual({
      ok: false,
      reason: "insufficient_balance",
      balanceRials: 2_000,
    });
    expect(tx.smsWalletTransaction.create).not.toHaveBeenCalled();
  });

  it("tells a missing wallet apart from an empty one", async () => {
    // They look identical to the UPDATE — both match no row. Reported as
    // "not enough credit", a missing wallet would make every send in that
    // workspace fail forever and topping up would not fix it.
    const tx = makeTx(null, null);

    await expect(debitWallet(tx as never, 7, input)).rejects.toThrow(
      /no SMS wallet row/,
    );
  });

  it("refuses a cost that is not a positive whole number of rials", async () => {
    const tx = makeTx(96_500);

    await expect(
      debitWallet(tx as never, 7, { ...input, costRials: 0 }),
    ).rejects.toThrow(/positive whole number/);
    await expect(
      debitWallet(tx as never, 7, { ...input, costRials: -350 }),
    ).rejects.toThrow(/positive whole number/);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("creditWallet", () => {
  it("adds credit with no condition on the balance", async () => {
    // There is no amount of credit a wallet is too poor to receive, so this
    // UPDATE carries no balance predicate at all.
    const tx = makeTx(300_000);

    const result = await creditWallet(tx as never, 7, {
      amountRials: 200_000,
      type: "topup",
      topupId: 3,
    });

    expect(result.balanceAfterRials).toBe(300_000);
    expect(tx.$queryRaw.mock.calls[0][0].join("?")).not.toMatch(
      /balance_rials >=/,
    );
    expect(tx.smsWalletTransaction.create.mock.calls[0][0].data).toMatchObject({
      type: "topup",
      topupId: 3,
      amountRials: 200_000,
      balanceBeforeRials: 100_000,
    });
  });

  it("throws when there is no wallet to credit", async () => {
    const tx = makeTx(null, null);

    await expect(
      creditWallet(tx as never, 7, { amountRials: 1_000, type: "topup" }),
    ).rejects.toThrow(/no SMS wallet row/);
  });
});

describe("refundMessage", () => {
  it("credits the wallet and ties the row to the message", async () => {
    const tx = makeTx(100_000);

    await refundMessage(tx as never, 7, {
      smsMessageId: 5,
      amountRials: 3_500,
    });

    expect(tx.smsWalletTransaction.create.mock.calls[0][0].data).toMatchObject({
      type: "refund",
      smsMessageId: 5,
      amountRials: 3_500,
      balanceBeforeRials: 96_500,
      balanceAfterRials: 100_000,
    });
  });

  it("credits before inserting, so a duplicate takes the credit with it", async () => {
    // The ordering is the idempotency mechanism. The unique index fires on
    // the INSERT, which aborts the transaction and rolls the credit back —
    // so a repeated refund leaves the balance exactly where it was without
    // this function looking first and hoping nothing happens in between.
    const tx = makeTx(100_000);

    await refundMessage(tx as never, 7, {
      smsMessageId: 5,
      amountRials: 3_500,
    });

    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.smsWalletTransaction.create.mock.invocationCallOrder[0],
    );
  });
});

describe("isDuplicateRefund", () => {
  it("recognises the unique violation and nothing else", () => {
    expect(isDuplicateRefund({ code: "P2002" })).toBe(true);
    expect(isDuplicateRefund({ code: "P2025" })).toBe(false);
    expect(isDuplicateRefund(new Error("boom"))).toBe(false);
    expect(isDuplicateRefund(null)).toBe(false);
  });
});
