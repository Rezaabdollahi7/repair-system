import type { Prisma } from "../generated/prisma/client";

/**
 * The number a shop puts on the intake slip.
 *
 * Until 2.9 this was the device's primary key, which comes from a sequence
 * shared by every workspace on the platform. That made the numbers one shop
 * sees depend on how many devices every other shop had taken in — the first
 * device of a new workshop could be numbered 4,812 — and it meant no two
 * shops could both have a device «۱». The key is still what foreign keys and
 * URLs use; this is what the customer is told.
 *
 * A bare integer rather than a prefixed string like PUR-0001, because
 * invoices have three kinds to tell apart and devices have one, and because
 * this number gets read aloud over the phone and sent as the #NUMBER#
 * parameter of every customer notification.
 */

/**
 * Reserves the next reception number for this workspace.
 *
 * `increment` compiles to `seq = seq + 1`, which takes a row lock, so two
 * staff taking in devices at the same moment get different numbers — the
 * same reasoning as nextInvoiceNumber, and the same reason a read-then-write
 * in JavaScript would not do.
 *
 * Takes a transaction client rather than the shared one, and for the same
 * two reasons as invoice numbering: the counter has to move in the same
 * transaction as the device it numbers, so a failed create returns the
 * number instead of leaving a hole in the series; and the extended client
 * would open a transaction of its own on a second connection, where the
 * lock this depends on would be taken and released somewhere else entirely.
 */
export async function nextReceptionNumber(
  tx: Prisma.TransactionClient,
  workspaceId: number,
): Promise<number> {
  const row = await tx.workspace.update({
    where: { id: workspaceId },
    data: { deviceSeq: { increment: 1 } },
    select: { deviceSeq: true },
  });

  return row.deviceSeq;
}
