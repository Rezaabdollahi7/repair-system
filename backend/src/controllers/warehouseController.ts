import { Request, Response } from "express";
import prisma, { runInWorkspaceTransaction } from "../lib/prisma";
import type { Prisma } from "../generated/prisma/client";
import { ValidatedRequest } from "../middleware/validate";
import { errorMessage, isUniqueConstraintError } from "../utils/errors";
import type { IdParam } from "../schemas/common";
import type { WarehouseBody, WarehouseStatusBody } from "../schemas/warehouse";
import { workspaceIdOf } from "../utils/workspace";

/*
 * Warehouses (roadmap 14.10).
 *
 * Every workspace is born with one, «انبار اصلی», and a shop that never adds
 * a second should never notice the concept exists. The rules:
 *
 *   * Exactly one default, always — a document that names no warehouse
 *     goes there. Moving the flag locks every warehouse row of the
 *     workspace, so two people setting different defaults queue rather
 *     than collide on the unique index.
 *   * No delete. The ledger and the invoices name their warehouse forever;
 *     a warehouse that is finished with is deactivated.
 *   * Deactivated only when it holds nothing, and never while it is the
 *     default. The row is taken FOR UPDATE before the shelves are counted,
 *     and the stock service takes it FOR SHARE before it moves anything, so
 *     a purchase cannot slip stock into a warehouse between the count and
 *     the switch.
 */

const DUPLICATE_NAME = { error: "انباری با این نام وجود دارد" };
const NOT_FOUND = { error: "انبار یافت نشد" };

/** A refusal decided inside a transaction, answered outside it. */
class Refusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const warehouseSelect = {
  id: true,
  name: true,
  isDefault: true,
  isActive: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  stocks: {
    where: { quantity: { gt: 0 } },
    select: {
      quantity: true,
      item: { select: { avgPurchasePrice: true } },
    },
  },
} satisfies Prisma.WarehouseSelect;

type WarehouseRow = Prisma.WarehouseGetPayload<{
  select: typeof warehouseSelect;
}>;

function toWarehouseResponse(warehouse: WarehouseRow) {
  const value = warehouse.stocks.reduce(
    (sum, stock) =>
      sum + stock.quantity.toNumber() * stock.item.avgPurchasePrice.toNumber(),
    0,
  );

  return {
    id: warehouse.id,
    name: warehouse.name,
    is_default: warehouse.isDefault === true,
    is_active: warehouse.isActive,
    note: warehouse.note,
    // How many different items are on its shelves, and what they cost —
    // enough to tell a busy warehouse from an empty one at a glance.
    item_count: warehouse.stocks.length,
    stock_value: Math.round(value * 100) / 100,
    created_at: warehouse.createdAt.toISOString(),
    updated_at: warehouse.updatedAt.toISOString(),
  };
}

async function findOne(
  client: Prisma.TransactionClient | typeof prisma,
  workspaceId: number,
  id: number,
) {
  return client.warehouse.findFirst({
    where: { id, workspaceId },
    select: warehouseSelect,
  });
}

/** Locks one warehouse row of this workspace, or refuses with a 404. */
async function lockWarehouse(
  tx: Prisma.TransactionClient,
  workspaceId: number,
  id: number,
) {
  const rows = await tx.$queryRaw<
    {
      id: number;
      name: string;
      is_default: boolean | null;
      is_active: boolean;
    }[]
  >`
    SELECT id, name, is_default, is_active
    FROM warehouses
    WHERE workspace_id = ${workspaceId} AND id = ${id}
    FOR UPDATE
  `;
  if (rows.length === 0) throw new Refusal(404, NOT_FOUND.error);
  return rows[0];
}

function answerError(res: Response, error: unknown) {
  if (error instanceof Refusal) {
    return res.status(error.status).json({ error: error.message });
  }
  if (isUniqueConstraintError(error)) {
    return res.status(400).json(DUPLICATE_NAME);
  }
  return res.status(500).json({ error: errorMessage(error) });
}

// GET /api/warehouses
export const getAll = async (req: Request, res: Response) => {
  try {
    // The default first, then the active ones by name, the retired last —
    // the order a picker wants as well as the page.
    const warehouses = await prisma.warehouse.findMany({
      where: { workspaceId: workspaceIdOf(req) },
      orderBy: [
        { isDefault: { sort: "asc", nulls: "last" } },
        { isActive: "desc" },
        { name: "asc" },
      ],
      select: warehouseSelect,
    });

    res.json(warehouses.map(toWarehouseResponse));
  } catch (error) {
    answerError(res, error);
  }
};

// POST /api/warehouses
export const create = async (req: Request, res: Response) => {
  try {
    const data = (req as ValidatedRequest).valid.body as WarehouseBody;
    const workspaceId = workspaceIdOf(req);

    // Never the default on creation: a new warehouse is empty, and the
    // default is where everything that names no warehouse goes.
    const created = await prisma.warehouse.create({
      data: { workspaceId, name: data.name, note: data.note },
      select: { id: true },
    });

    const warehouse = await findOne(prisma, workspaceId, created.id);
    res.status(201).json(toWarehouseResponse(warehouse as WarehouseRow));
  } catch (error) {
    answerError(res, error);
  }
};

// PUT /api/warehouses/:id
export const update = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const data = valid.body as WarehouseBody;
    const workspaceId = workspaceIdOf(req);

    // updateMany with the workspace in the filter: one query both scopes the
    // write and tells another shop's id (count 0, so 404) from its own.
    const { count } = await prisma.warehouse.updateMany({
      where: { id, workspaceId },
      data: { name: data.name, note: data.note },
    });
    if (count === 0) return res.status(404).json(NOT_FOUND);

    const warehouse = await findOne(prisma, workspaceId, id);
    res.json(toWarehouseResponse(warehouse as WarehouseRow));
  } catch (error) {
    answerError(res, error);
  }
};

// POST /api/warehouses/:id/default
export const setDefault = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;
    const workspaceId = workspaceIdOf(req);

    const warehouse = await runInWorkspaceTransaction(
      workspaceId,
      async (tx) => {
        // Every warehouse of the workspace, in id order. Two requests moving
        // the flag at once would otherwise both clear the old default and
        // both set their own, and the second would fail on the unique index
        // with an error nobody could read.
        const rows = await tx.$queryRaw<{ id: number; is_active: boolean }[]>`
          SELECT id, is_active
          FROM warehouses
          WHERE workspace_id = ${workspaceId}
          ORDER BY id
          FOR UPDATE
        `;
        const target = rows.find((row) => row.id === id);
        if (!target) throw new Refusal(404, NOT_FOUND.error);
        if (!target.is_active) {
          throw new Refusal(
            400,
            "انبار غیرفعال نمی‌تواند پیش‌فرض باشد. ابتدا آن را فعال کنید",
          );
        }

        // Cleared before it is set: the unique index allows one TRUE per
        // workspace, and NULL — not FALSE — on every other row.
        await tx.warehouse.updateMany({
          where: { workspaceId, isDefault: true, id: { not: id } },
          data: { isDefault: null },
        });
        await tx.warehouse.updateMany({
          where: { workspaceId, id },
          data: { isDefault: true },
        });

        return findOne(tx, workspaceId, id);
      },
    );

    res.json(toWarehouseResponse(warehouse as WarehouseRow));
  } catch (error) {
    answerError(res, error);
  }
};

// PUT /api/warehouses/:id/status
export const setStatus = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const { is_active: isActive } = valid.body as WarehouseStatusBody;
    const workspaceId = workspaceIdOf(req);

    const warehouse = await runInWorkspaceTransaction(
      workspaceId,
      async (tx) => {
        const row = await lockWarehouse(tx, workspaceId, id);

        if (!isActive) {
          if (row.is_default) {
            throw new Refusal(
              400,
              "انبار پیش‌فرض را نمی‌توان غیرفعال کرد. ابتدا انبار دیگری را پیش‌فرض کنید",
            );
          }

          // Counted after the lock: a movement into this warehouse either
          // committed before it (and is counted) or waits behind it and then
          // finds the warehouse inactive.
          const held = await tx.itemStock.count({
            where: { workspaceId, warehouseId: id, quantity: { gt: 0 } },
          });
          if (held > 0) {
            throw new Refusal(
              400,
              `انبار «${row.name}» هنوز ${held} کالا با موجودی دارد. پیش از غیرفعال کردن، موجودی آن را صفر یا به انبار دیگری منتقل کنید`,
            );
          }
        }

        await tx.warehouse.updateMany({
          where: { workspaceId, id },
          data: { isActive },
        });

        return findOne(tx, workspaceId, id);
      },
    );

    res.json(toWarehouseResponse(warehouse as WarehouseRow));
  } catch (error) {
    answerError(res, error);
  }
};
