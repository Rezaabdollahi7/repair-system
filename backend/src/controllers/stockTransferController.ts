import { Request, Response } from "express";
import prisma, { runInWorkspaceTransaction } from "../lib/prisma";
import type { Prisma } from "../generated/prisma/client";
import { ValidatedRequest } from "../middleware/validate";
import { AuthenticatedRequest } from "../types/request";
import { errorMessage } from "../utils/errors";
import { dateFilter } from "../utils/dateRange";
import { nextInvoiceNumber } from "../utils/invoiceNumber";
import {
  applyStockMovements,
  StockError,
  type StockLine,
} from "../utils/stock";
import { resolveWarehouseId } from "../utils/warehouse";
import { workspaceIdOf } from "../utils/workspace";
import type { IdParam } from "../schemas/common";
import type {
  StockTransferCreateBody,
  StockTransferListQuery,
} from "../schemas/stockTransfer";

/*
 * Stock transfers (roadmap 14.16) — TRF-0001.
 *
 * Stock moving from one warehouse to another: the shelf in the shop to the
 * bench, the store room to the counter. Each line is two ledger rows written
 * in one transaction — `transfer_out` from the source, `transfer_in` to the
 * destination — so there is no moment at which the stock is in neither, or
 * in both.
 *
 * Cost does not move. The moving average is per item, not per warehouse
 * (14 decisions), so both rows go at the item's current average and the
 * average stays where it was; the line stores that figure only so the
 * document can say what was moved, in rials.
 *
 * Applied on save and never edited or deleted, like an adjustment. A
 * transfer made by mistake is undone by another in the other direction,
 * and both stay on the record.
 */

/** The reference the ledger rows carry back to their document. */
export const TRANSFER_REFERENCE = "stock_transfer";

const NOT_FOUND = { error: "سند انتقال یافت نشد" };

const headerInclude = {
  fromWarehouse: { select: { name: true } },
  toWarehouse: { select: { name: true } },
  author: { select: { fullName: true, username: true } },
} satisfies Prisma.StockTransferInclude;

const listInclude = {
  ...headerInclude,
  lines: { select: { quantity: true, unitCost: true } },
} satisfies Prisma.StockTransferInclude;

const detailInclude = {
  ...headerInclude,
  lines: {
    orderBy: { id: "asc" },
    include: { item: { select: { code: true, name: true, unit: true } } },
  },
} satisfies Prisma.StockTransferInclude;

type ListRow = Prisma.StockTransferGetPayload<{ include: typeof listInclude }>;
type DetailRow = Prisma.StockTransferGetPayload<{
  include: typeof detailInclude;
}>;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function toHeader(row: ListRow | DetailRow) {
  const value = row.lines.reduce(
    (sum, line) => sum + line.quantity.toNumber() * line.unitCost.toNumber(),
    0,
  );
  return {
    id: row.id,
    number: row.number,
    from_warehouse_id: row.fromWarehouseId,
    from_warehouse_name: row.fromWarehouse.name,
    to_warehouse_id: row.toWarehouseId,
    to_warehouse_name: row.toWarehouse.name,
    transferred_at: row.transferredAt.toISOString(),
    description: row.description,
    created_by: row.createdBy,
    created_by_name:
      row.author?.fullName?.trim() || row.author?.username || null,
    created_at: row.createdAt.toISOString(),
    line_count: row.lines.length,
    value: roundMoney(value),
  };
}

function toDetail(row: DetailRow) {
  return {
    ...toHeader(row),
    lines: row.lines.map((line) => ({
      id: line.id,
      item_id: line.itemId,
      item_code: line.item.code,
      item_name: line.item.name,
      item_unit: line.item.unit,
      quantity: line.quantity.toNumber(),
      unit_cost: line.unitCost.toNumber(),
      value: roundMoney(line.quantity.toNumber() * line.unitCost.toNumber()),
      note: line.note,
    })),
  };
}

// GET /api/stock-transfers
export const getAll = async (req: Request, res: Response) => {
  try {
    const query = (req as ValidatedRequest).valid
      .query as StockTransferListQuery;
    const { page, limit } = query;

    const where: Prisma.StockTransferWhereInput = {
      workspaceId: workspaceIdOf(req),
    };
    if (query.warehouse_id !== undefined) {
      where.OR = [
        { fromWarehouseId: query.warehouse_id },
        { toWarehouseId: query.warehouse_id },
      ];
    }
    const transferredAt = dateFilter(query.from_date, query.to_date);
    if (transferredAt) where.transferredAt = transferredAt;

    const [total, rows] = await Promise.all([
      prisma.stockTransfer.count({ where }),
      prisma.stockTransfer.findMany({
        where,
        orderBy: [{ transferredAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: listInclude,
      }),
    ]);

    res.json({
      data: rows.map(toHeader),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/stock-transfers/:id
export const getById = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;

    const row = await prisma.stockTransfer.findFirst({
      where: { id, workspaceId: workspaceIdOf(req) },
      include: detailInclude,
    });
    if (!row) return res.status(404).json(NOT_FOUND);

    res.json(toDetail(row));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// POST /api/stock-transfers
export const create = async (req: Request, res: Response) => {
  try {
    const body = (req as ValidatedRequest).valid
      .body as StockTransferCreateBody;
    const workspaceId = workspaceIdOf(req);
    const actorId = (req as AuthenticatedRequest).user?.id ?? null;
    const transferredAt = body.transferred_at ?? new Date();

    const created = await runInWorkspaceTransaction(workspaceId, async (tx) => {
      // Scoped by workspace and refused when inactive, before anything is
      // written — the service checks again under its lock.
      const fromWarehouseId = await resolveWarehouseId(
        tx,
        workspaceId,
        body.from_warehouse_id,
      );
      const toWarehouseId = await resolveWarehouseId(
        tx,
        workspaceId,
        body.to_warehouse_id,
      );

      const number = await nextInvoiceNumber(tx, workspaceId, "transfer");

      const header = await tx.stockTransfer.create({
        data: {
          workspaceId,
          number,
          fromWarehouseId,
          toWarehouseId,
          transferredAt,
          description: body.description,
          createdBy: actorId,
        },
        select: { id: true },
      });

      // Out, then in, per line. Each item appears once (the schema sees to
      // it), so the out always sees the source's real quantity; no unit
      // cost on either, so both go at the average and leave it alone.
      const lines: StockLine[] = body.lines.flatMap((line) => [
        {
          itemId: line.item_id,
          warehouseId: fromWarehouseId,
          quantity: -line.quantity,
          type: "transfer_out" as const,
          note: line.note ?? body.description,
        },
        {
          itemId: line.item_id,
          warehouseId: toWarehouseId,
          quantity: line.quantity,
          type: "transfer_in" as const,
          note: line.note ?? body.description,
        },
      ]);

      const moved = await applyStockMovements(
        tx,
        workspaceId,
        {
          referenceType: TRANSFER_REFERENCE,
          referenceId: header.id,
          occurredAt: transferredAt,
          actorId,
        },
        lines,
      );

      await tx.stockTransferLine.createMany({
        data: body.lines.map((line, index) => ({
          workspaceId,
          transferId: header.id,
          itemId: line.item_id,
          quantity: line.quantity,
          // The out movement's answer; the in went at the same figure.
          unitCost: moved[index * 2].unitCost,
          note: line.note,
        })),
      });

      return tx.stockTransfer.findFirstOrThrow({
        where: { id: header.id, workspaceId },
        include: detailInclude,
      });
    });

    res.status(201).json(toDetail(created));
  } catch (error) {
    if (error instanceof StockError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: errorMessage(error) });
  }
};
