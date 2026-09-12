import { Prisma } from "../generated/prisma/client";

/**
 * The only module that writes `sms_wallets`.
 *
 * Every function here takes a transaction client rather than the shared one,
 * for the reason extendSubscription does: moving a balance and recording why
 * it moved have to land together or not at all. A debit that commits without
 * its ledger row is money that left with no explanation, and the balance
 * column would then disagree with SUM(amount_rials) forever.
 *
 * ⚠️ The raw statements below carry no workspace context of their own
 * (RULES §7). They are safe only because every caller runs them inside
 * runInWorkspaceTransaction(), which sets one as its first statement — the
 * same contract extendSubscription works under. `workspaceId` is still named
 * explicitly in each WHERE, so the policy and the predicate have to agree.
 */

/**
 * Derived from the generated client rather than written out, so a change to
 * the enum in schema.prisma is a compile error here rather than a string
 * that silently stops matching.
 */
type WalletTransactionType =
  Prisma.SmsWalletTransactionUncheckedCreateInput["type"];

/**
 * A ledger line, worked out from the balance the database returned.
 *
 * Pure and exported because RULES §3 asks for it: this is arithmetic on
 * money, and the moving-average cost was wrong for months partly because the
 * formula was inlined where nothing could test it.
 *
 * `signedAmountRials` is negative for a send and positive for a top-up or
 * refund — the sign is stored rather than inferred from the type, which is
 * what makes `balance_rials` checkable against SUM(amount_rials).
 */
export function ledgerLine(
  balanceAfterRials: number,
  signedAmountRials: number,
): {
  amountRials: number;
  balanceBeforeRials: number;
  balanceAfterRials: number;
} {
  if (!Number.isSafeInteger(signedAmountRials) || signedAmountRials === 0) {
    // Zero would write a row that records nothing. A fraction would mean
    // somebody is holding tomans, or floating point has got into a column
    // the schema declares as Decimal(18,0).
    throw new Error(
      `A wallet movement must be a non-zero whole number of rials, got ${signedAmountRials}`,
    );
  }

  const balanceBeforeRials = balanceAfterRials - signedAmountRials;

  // Both ends checked, not just the new one. A negative `before` means the
  // balance was already wrong when we read it, which is worth failing on
  // rather than recording faithfully.
  if (balanceAfterRials < 0 || balanceBeforeRials < 0) {
    throw new Error(
      `A wallet balance cannot be negative: ${balanceBeforeRials} → ${balanceAfterRials}`,
    );
  }

  return {
    amountRials: signedAmountRials,
    balanceBeforeRials,
    balanceAfterRials,
  };
}

/**
 * A numeric column, whatever the driver hands back.
 *
 * Postgres `numeric` arrives as a string through some drivers and as a
 * Decimal through others, and a raw query does not go through Prisma's own
 * result mapping. Reading it with `Number(...)` alone would turn an
 * unexpected shape into NaN and carry it silently into the ledger.
 */
function toRials(value: unknown): number {
  const parsed =
    typeof value === "number" ? value : Number(String(value ?? "NaN"));

  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Expected a whole number of rials, got ${String(value)}`);
  }

  return parsed;
}

/**
 * Every amount is cast to numeric in SQL rather than left to the driver.
 *
 * A JS number can reach Postgres as float8, and `numeric - float8` is
 * `double precision` — floating point arithmetic on a money column, which
 * would round in ways nobody could reproduce afterwards. The cast keeps the
 * whole expression exact.
 */
async function moveBalance(
  tx: Prisma.TransactionClient,
  workspaceId: number,
  signedAmountRials: number,
  requireFunds: boolean,
): Promise<number | null> {
  const rows = requireFunds
    ? await tx.$queryRaw<{ balance_rials: unknown }[]>`
        UPDATE sms_wallets
        SET balance_rials = balance_rials + ${signedAmountRials}::numeric,
            updated_at = now()
        WHERE workspace_id = ${workspaceId}
          AND balance_rials >= ${-signedAmountRials}::numeric
        RETURNING balance_rials
      `
    : await tx.$queryRaw<{ balance_rials: unknown }[]>`
        UPDATE sms_wallets
        SET balance_rials = balance_rials + ${signedAmountRials}::numeric,
            updated_at = now()
        WHERE workspace_id = ${workspaceId}
        RETURNING balance_rials
      `;

  return rows.length === 0 ? null : toRials(rows[0].balance_rials);
}

export type DebitResult =
  | { ok: true; balanceAfterRials: number; transactionId: number }
  | { ok: false; reason: "insufficient_balance"; balanceRials: number };

/**
 * Takes the cost of one message out of the wallet, or refuses.
 *
 * The check and the subtraction are a single statement:
 *
 *     UPDATE ... SET balance = balance - cost
 *     WHERE workspace_id = ... AND balance >= cost
 *
 * so the balance can never go negative, whatever else is happening at the
 * same moment. Reading the balance in JavaScript and deciding there is the
 * race the brief describes: two users of one workshop, 500 toman of credit,
 * two messages at 350, and a balance of −200. The row lock Postgres takes
 * for the UPDATE is what serialises them; the second caller re-reads the
 * balance the first one left and matches no row.
 *
 * Refusing is a return value rather than an exception. A shop running out of
 * credit is an ordinary outcome that the caller records as a message status
 * — not an error, and not something to distinguish by catching and
 * inspecting.
 */
export async function debitWallet(
  tx: Prisma.TransactionClient,
  workspaceId: number,
  input: {
    costRials: number;
    smsMessageId: number;
    description?: string;
    createdBy?: number | null;
  },
): Promise<DebitResult> {
  if (!Number.isSafeInteger(input.costRials) || input.costRials <= 0) {
    throw new Error(
      `A debit must be a positive whole number of rials, got ${input.costRials}`,
    );
  }

  const balanceAfterRials = await moveBalance(
    tx,
    workspaceId,
    -input.costRials,
    true,
  );

  if (balanceAfterRials === null) {
    // Two very different things look identical here: not enough credit, and
    // no wallet row at all. The second would make every send in that
    // workspace report "not enough credit" forever, and topping up would not
    // change it — so it is separated out and thrown rather than returned.
    // populateWorkspace creates the row, and the 12.1 migration backfilled
    // the workspaces that predate it; reaching this is a bug, not a balance.
    const wallet = await tx.smsWallet.findUnique({
      where: { workspaceId },
      select: { balanceRials: true },
    });

    if (wallet === null) {
      throw new Error(
        `Workspace ${workspaceId} has no SMS wallet row. Every workspace ` +
          `gets one from populateWorkspace; a missing one is a broken ` +
          `sign-up, not an empty wallet.`,
      );
    }

    return {
      ok: false,
      reason: "insufficient_balance",
      balanceRials: wallet.balanceRials.toNumber(),
    };
  }

  const line = ledgerLine(balanceAfterRials, -input.costRials);

  const row = await tx.smsWalletTransaction.create({
    data: {
      workspaceId,
      type: "send" satisfies WalletTransactionType,
      smsMessageId: input.smsMessageId,
      description: input.description,
      createdBy: input.createdBy ?? null,
      ...line,
    },
    select: { id: true },
  });

  return { ok: true, balanceAfterRials, transactionId: row.id };
}

/**
 * Adds credit, for a verified top-up or an operator correction.
 *
 * No condition on the UPDATE: there is no amount of credit a wallet is too
 * poor to receive. The only failure is a missing wallet row, which is the
 * same bug the debit path throws on.
 */
export async function creditWallet(
  tx: Prisma.TransactionClient,
  workspaceId: number,
  input: {
    amountRials: number;
    type: Extract<WalletTransactionType, "topup" | "adjustment">;
    topupId?: number;
    description?: string;
    createdBy?: number | null;
  },
): Promise<{ balanceAfterRials: number; transactionId: number }> {
  if (!Number.isSafeInteger(input.amountRials) || input.amountRials <= 0) {
    throw new Error(
      `A credit must be a positive whole number of rials, got ${input.amountRials}`,
    );
  }

  const balanceAfterRials = await moveBalance(
    tx,
    workspaceId,
    input.amountRials,
    false,
  );

  if (balanceAfterRials === null) {
    throw new Error(
      `Workspace ${workspaceId} has no SMS wallet row to credit.`,
    );
  }

  const line = ledgerLine(balanceAfterRials, input.amountRials);

  const row = await tx.smsWalletTransaction.create({
    data: {
      workspaceId,
      type: input.type,
      topupId: input.topupId,
      description: input.description,
      createdBy: input.createdBy ?? null,
      ...line,
    },
    select: { id: true },
  });

  return { balanceAfterRials, transactionId: row.id };
}

/**
 * Gives back what a message cost, when the provider refused it after the
 * money was already taken.
 *
 * The credit happens first and the ledger row second, deliberately. The
 * unique index on (sms_message_id, type) is what makes a second refund
 * impossible, and it fires on the INSERT — which aborts the transaction and
 * takes the credit with it. So a repeated refund leaves the balance exactly
 * where it was, without this function having to look first and hope nothing
 * happens in between.
 *
 * ⚠️ That also means a duplicate poisons the transaction it runs in. Give
 * this call its own runInWorkspaceTransaction rather than sharing one with
 * work that must survive, and read the rejection with isDuplicateRefund().
 */
export async function refundMessage(
  tx: Prisma.TransactionClient,
  workspaceId: number,
  input: {
    smsMessageId: number;
    amountRials: number;
    description?: string;
  },
): Promise<{ balanceAfterRials: number; transactionId: number }> {
  if (!Number.isSafeInteger(input.amountRials) || input.amountRials <= 0) {
    throw new Error(
      `A refund must be a positive whole number of rials, got ${input.amountRials}`,
    );
  }

  const balanceAfterRials = await moveBalance(
    tx,
    workspaceId,
    input.amountRials,
    false,
  );

  if (balanceAfterRials === null) {
    throw new Error(
      `Workspace ${workspaceId} has no SMS wallet row to refund into.`,
    );
  }

  const line = ledgerLine(balanceAfterRials, input.amountRials);

  const row = await tx.smsWalletTransaction.create({
    data: {
      workspaceId,
      type: "refund" satisfies WalletTransactionType,
      smsMessageId: input.smsMessageId,
      description: input.description,
      ...line,
    },
    select: { id: true },
  });

  return { balanceAfterRials, transactionId: row.id };
}

/**
 * Whether a rejection from refundMessage was the second refund for a message
 * rather than something that went wrong.
 *
 * Here rather than in the caller so that P2002 — and the knowledge that this
 * particular unique index is the idempotency rule — stays inside the module
 * that owns the wallet.
 *
 * P2002 is not narrowed to a constraint name because there is only one
 * unique index on sms_wallet_transactions, and refundMessage writes to no
 * other table. If a second one is ever added, this has to start reading
 * `meta.target` — otherwise an unrelated collision would be reported as a
 * refund that had already happened.
 */
export function isDuplicateRefund(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}
