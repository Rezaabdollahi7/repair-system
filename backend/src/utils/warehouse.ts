import type { Prisma } from "../generated/prisma/client";
import { InactiveWarehouseError, UnknownWarehouseError } from "./stock";

/**
 * The workspace's default warehouse — the one every document uses when the
 * shop has never added a second, and the one a document without an explicit
 * warehouse falls back to.
 *
 * findFirstOrThrow rather than a nullable lookup: every workspace is given
 * one when it is created (populateWorkspace) or by the 14.1 migration, and a
 * workspace without one is a bug that should surface as one, not as stock
 * silently written nowhere.
 */
export async function defaultWarehouseId(
  tx: Prisma.TransactionClient,
  workspaceId: number,
): Promise<number> {
  const warehouse = await tx.warehouse.findFirstOrThrow({
    where: { workspaceId, isDefault: true },
    select: { id: true },
  });

  return warehouse.id;
}

/**
 * The warehouse a new document names, or the default when it names none.
 *
 * Checked here, not left to the foreign key: a foreign-key check does not
 * go through row-level security, so an id belonging to another workspace
 * would satisfy it. Scoped by workspace, such an id reads as missing.
 */
export async function resolveWarehouseId(
  tx: Prisma.TransactionClient,
  workspaceId: number,
  requested: number | null | undefined,
): Promise<number> {
  if (requested === null || requested === undefined) {
    return defaultWarehouseId(tx, workspaceId);
  }

  const warehouse = await tx.warehouse.findFirst({
    where: { id: requested, workspaceId },
    select: { id: true, name: true, isActive: true },
  });

  if (!warehouse) throw new UnknownWarehouseError(requested);
  if (!warehouse.isActive) throw new InactiveWarehouseError(warehouse.name);

  return warehouse.id;
}
