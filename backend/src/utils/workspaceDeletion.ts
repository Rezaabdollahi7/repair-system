import { runInWorkspaceTransaction } from "../lib/prisma";
import type { Prisma } from "../generated/prisma/client";
import { deleteByPrefix, deleteObjects } from "../lib/storage";
import { errorMessage } from "./errors";

/**
 * Every tenant-scoped table, in an order the foreign keys allow.
 *
 * ⚠️ Written out rather than derived, and ordered rather than alphabetical.
 * The workspace row itself is never deleted — the application role has no
 * DELETE on it, deliberately — so nothing cascades and each table has to go
 * before whatever references it.
 *
 * Two constraints in particular decide this order:
 *
 *   * purchase_invoice_items and sale_invoice_items reference items with
 *     Restrict, so every invoice line goes before any item.
 *   * repair_invoices references devices with Restrict, so repair invoices
 *     go before devices.
 *
 * Not on this list, on purpose: payments, subscription_events,
 * discount_code_uses and referrals. The ledger outlives the workspace, which
 * is the whole reason the row survives as a tombstone. referral_codes does
 * go — a link to a deleted workshop should stop working.
 */
// ⚠️ Prisma's delegates are singular — `tx.user`, not `tx.users` — and the
// names below are those, not the table names. Getting it wrong is a compile
// error rather than a night the cron half-deletes a workspace, which is the
// reason this is typed against TransactionClient at all.
export const DELETION_ORDER = [
  "deviceAssignment",
  "deviceImage",
  "repairInvoicePayment",
  "repairInvoiceItem",
  "repairInvoice",
  "purchaseInvoiceItem",
  "saleInvoiceItem",
  "purchaseInvoice",
  "saleInvoice",
  "inventoryTransaction",
  "device",
  "item",
  "category",
  "service",
  "customer",
  "settings",
  "backup",
  "refreshToken",
  "referralCode",
  "user",
] as const;

export type DeletableModel = (typeof DELETION_ORDER)[number];

/**
 * Every object key this workspace's rows point at.
 *
 * Read from the rows rather than assumed from the prefix, because the two
 * can disagree: ops/extract-workspace.sh restores a workspace under a NEW
 * id, and its images keep the old prefix — filepath stores the full key and
 * is signed as-is, so they still load, but a prefix sweep would walk right
 * past them.
 *
 * The sweep still runs afterwards, for the opposite case: an upload whose
 * row never landed has no row to read a key from.
 */
async function keysFromRows(workspaceId: number): Promise<string[]> {
  return runInWorkspaceTransaction(workspaceId, async (tx) => {
    const keys: string[] = [];

    const images = await tx.deviceImage.findMany({
      select: { filepath: true, thumbnailPath: true },
    });

    for (const image of images) {
      keys.push(image.filepath);
      // Null for rows written before 7.0.
      if (image.thumbnailPath) {
        keys.push(image.thumbnailPath);
      }
    }

    const settings = await tx.settings.findFirst({
      select: { companyLogo: true, stampImage: true, signatureImage: true },
    });

    for (const key of [
      settings?.companyLogo,
      settings?.stampImage,
      settings?.signatureImage,
    ]) {
      if (key) {
        keys.push(key);
      }
    }

    const exports = await tx.backup.findMany({
      where: { filepath: { not: null } },
      select: { filepath: true },
    });

    for (const row of exports) {
      if (row.filepath) {
        keys.push(row.filepath);
      }
    }

    return keys;
  });
}

/**
 * Removes a workspace's tenant data and marks the row as a tombstone.
 *
 * The workspace itself stays. Its payments and subscription events point at
 * it, and a ledger whose subject has vanished is not a ledger — so the row
 * keeps its id, its name, and a deletedAt saying when this happened.
 *
 * ⚠️ Three steps in this order, and the order is the whole design: read the
 * keys, remove the objects, then remove the rows. Deleting rows first would
 * lose the only record of which objects belonged to this workspace, and they
 * would sit in the bucket being paid for indefinitely — storage being the
 * one cost that never comes back down.
 */
export async function deleteWorkspaceData(workspaceId: number): Promise<void> {
  // Outside any transaction: object storage has no rollback, and holding a
  // database transaction open across calls to Arvan would tie up one of ten
  // pooled connections for as long as the bucket takes.
  //
  // Failures are logged rather than thrown, like every other deletion here:
  // an orphaned object wastes kilobytes, while a thrown error leaves a
  // workspace nobody can finish removing.
  try {
    await deleteObjects(await keysFromRows(workspaceId));

    // The catch-all, for objects whose rows are already gone.
    await deleteByPrefix(`workspaces/${workspaceId}/`);
    await deleteByPrefix(`exports/${workspaceId}/`);
  } catch (error) {
    console.error(
      `objects for workspace ${workspaceId} could not all be removed:`,
      errorMessage(error),
    );
  }

  await runInWorkspaceTransaction(workspaceId, async (tx) => {
    for (const model of DELETION_ORDER) {
      // Looked up by name, which no amount of typing makes pretty. The
      // alternative is twenty near-identical lines that a reordering would
      // silently break apart from the list above.
      // The cast is to the shape every delegate shares, not to `any`: the
      // names above are already checked against TransactionClient, so what
      // is being waived is the per-model argument type, not their existence.
      const delegate = tx[model] as unknown as {
        deleteMany: (args: {
          where: { workspaceId: number };
        }) => Promise<Prisma.BatchPayload>;
      };

      await delegate.deleteMany({ where: { workspaceId } });
    }

    // Counters reset too: if this workspace ever comes back from a backup it
    // should open its books at 0001 rather than continue a sequence whose
    // invoices no longer exist.
    await tx.workspace.update({
      where: { id: workspaceId },
      data: {
        status: "deleted",
        deletedAt: new Date(),
        purchaseSeq: 0,
        saleSeq: 0,
        repairSeq: 0,
      },
    });
  });
}
