import type { Prisma } from "../generated/prisma/client";

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
