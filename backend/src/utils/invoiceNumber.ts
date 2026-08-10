import type { Prisma } from "../generated/prisma/client";

/**
 * Fixed per invoice kind rather than read from settings.
 *
 * An invoice number is accounting data: its job is to be unique, sequential
 * and gap-free so a figure can be traced back months later. What a workshop
 * actually wants to customise is how the printed invoice looks, which is a
 * presentation concern and a separate piece of work (roadmap 9.5).
 */
export const INVOICE_PREFIXES = {
  purchase: "PUR",
  sale: "SAL",
  repair: "REP",
} as const;

export type InvoiceKind = keyof typeof INVOICE_PREFIXES;

/** Four digits covers 9,999 invoices before widening; it doesn't wrap. */
const PADDING = 4;

/**
 * Reserves the next number for this workspace and kind.
 *
 * Replaces "count today's invoices and add one", which two concurrent
 * requests could both read before either wrote — narrow, but real, and the
 * unique constraint turned the loser into a failed save rather than a
 * duplicate. `increment` compiles to `seq = seq + 1`, which takes a row lock,
 * so each caller gets a number nobody else can get.
 *
 * Takes a transaction client, not the shared one, for two reasons: the
 * counter must move in the same transaction as the invoice it numbers, so a
 * rollback returns the number instead of leaving a gap in the books; and the
 * extended client would open a transaction of its own on another connection.
 */
export async function nextInvoiceNumber(
  tx: Prisma.TransactionClient,
  workspaceId: number,
  kind: InvoiceKind,
): Promise<string> {
  let seq: number;

  // Spelled out per kind rather than indexed by a computed key: Prisma's
  // generated types can't follow a dynamic column name, and the alternative
  // is casting away exactly the checking that makes this safe.
  switch (kind) {
    case "purchase": {
      const row = await tx.workspace.update({
        where: { id: workspaceId },
        data: { purchaseSeq: { increment: 1 } },
        select: { purchaseSeq: true },
      });
      seq = row.purchaseSeq;
      break;
    }
    case "sale": {
      const row = await tx.workspace.update({
        where: { id: workspaceId },
        data: { saleSeq: { increment: 1 } },
        select: { saleSeq: true },
      });
      seq = row.saleSeq;
      break;
    }
    case "repair": {
      const row = await tx.workspace.update({
        where: { id: workspaceId },
        data: { repairSeq: { increment: 1 } },
        select: { repairSeq: true },
      });
      seq = row.repairSeq;
      break;
    }
  }

  return `${INVOICE_PREFIXES[kind]}-${String(seq).padStart(PADDING, "0")}`;
}
