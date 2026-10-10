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
  StockAdjustmentCreateBody,
  StockAdjustmentListQuery,
} from "../schemas/stockAdjustment";

/*
 * Stock adjustments (roadmap 14.14) — ADJ-0001.
 *
 * The shop correcting the shelf by hand: a part broken on the bench, one
 * lost, one found, a quantity entered wrongly. Applied the moment it is
 * saved (no approval step, agreed 9 October), through the stock service like
 * every other movement, and never edited or deleted: the ledger rows it
 * wrote are append-only, and a mistaken adjustment is put right by another
 * one, which leaves both on the record.
 */

/** The reference the ledger rows carry back to their document. */
export const ADJUSTMENT_REFERENCE = "stock_adjustment";

const NOT_FOUND = { error: "سند اصلاح موجودی یافت نشد" };

const headerInclude = {
  warehouse: { select: { name: true } },
  author: { select: { fullName: true, username: true } },
} satisfies Prisma.StockAdjustmentInclude;

const listInclude = {
  ...headerInclude,
  lines: { select: { quantity: true, unitCost: true } },
} satisfies Prisma.StockAdjustmentInclude;

const detailInclude = {
  ...headerInclude,
  lines: {
    orderBy: { id: "asc" },
    include: { item: { select: { code: true, name: true, unit: true } } },
  },
} satisfies Prisma.StockAdjustmentInclude;

type ListRow = Prisma.StockAdjustmentGetPayload<{
  include: typeof listInclude;
}>;
type DetailRow = Prisma.StockAdjustmentGetPayload<{
  include: typeof detailInclude;
}>;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * What came onto the shelf and what left it, in rials at the cost each line
 * moved at. Two figures rather than a net: a damaged part and a found one of
 * the same value net to nothing, and the shop wants to see both.
 */
function values(
  lines: { quantity: Prisma.Decimal; unitCost: Prisma.Decimal }[],
) {
  let valueIn = 0;
  let valueOut = 0;
  for (const line of lines) {
    const value = line.quantity.toNumber() * line.unitCost.toNumber();
    if (value > 0) valueIn += value;
    else valueOut -= value;
  }
  return { value_in: roundMoney(valueIn), value_out: roundMoney(valueOut) };
}

function toHeader(row: ListRow | DetailRow) {
  return {
    id: row.id,
    number: row.number,
    warehouse_id: row.warehouseId,
    warehouse_name: row.warehouse.name,
    adjusted_at: row.adjustedAt.toISOString(),
    description: row.description,
    created_by: row.createdBy,
    // The username is never empty and is a phone number a shop recognises;
    // fullName is a form field and can be.
    created_by_name:
      row.author?.fullName?.trim() || row.author?.username || null,
    created_at: row.createdAt.toISOString(),
    line_count: row.lines.length,
    ...values(row.lines),
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
      reason: line.reason,
      note: line.note,
      unit_cost: line.unitCost.toNumber(),
      value: roundMoney(line.quantity.toNumber() * line.unitCost.toNumber()),
    })),
  };
}

// GET /api/stock-adjustments
export const getAll = async (req: Request, res: Response) => {
  try {
    const query = (req as ValidatedRequest).valid
      .query as StockAdjustmentListQuery;
    const { page, limit } = query;

    const where: Prisma.StockAdjustmentWhereInput = {
      workspaceId: workspaceIdOf(req),
    };
    if (query.warehouse_id !== undefined) {
      where.warehouseId = query.warehouse_id;
    }
    const adjustedAt = dateFilter(query.from_date, query.to_date);
    if (adjustedAt) where.adjustedAt = adjustedAt;

    const [total, rows] = await Promise.all([
      prisma.stockAdjustment.count({ where }),
      prisma.stockAdjustment.findMany({
        where,
        // The number breaks ties: two adjustments on one day read in the
        // order they were made.
        orderBy: [{ adjustedAt: "desc" }, { id: "desc" }],
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

// GET /api/stock-adjustments/:id
export const getById = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;

    const row = await prisma.stockAdjustment.findFirst({
      where: { id, workspaceId: workspaceIdOf(req) },
      include: detailInclude,
    });
    if (!row) return res.status(404).json(NOT_FOUND);

    res.json(toDetail(row));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// POST /api/stock-adjustments
export const create = async (req: Request, res: Response) => {
  try {
    const body = (req as ValidatedRequest).valid
      .body as StockAdjustmentCreateBody;
    const workspaceId = workspaceIdOf(req);
    const actorId = (req as AuthenticatedRequest).user?.id ?? null;
    const adjustedAt = body.adjusted_at ?? new Date();

    const created = await runInWorkspaceTransaction(workspaceId, async (tx) => {
      const warehouseId = await resolveWarehouseId(
        tx,
        workspaceId,
        body.warehouse_id,
      );

      // The number is drawn inside the transaction, so a refused adjustment
      // gives it back rather than leaving a gap.
      const number = await nextInvoiceNumber(tx, workspaceId, "adjustment");

      const header = await tx.stockAdjustment.create({
        data: {
          workspaceId,
          number,
          warehouseId,
          adjustedAt,
          description: body.description,
          createdBy: actorId,
        },
        select: { id: true },
      });

      const lines: StockLine[] = body.lines.map((line) => ({
        itemId: line.item_id,
        warehouseId,
        quantity: line.direction === "in" ? line.quantity : -line.quantity,
        type: "adjustment",
        reason: line.reason,
        // Only stock coming in can carry a cost of its own; the schema
        // refuses one going out.
        unitCost: line.direction === "in" ? (line.unit_cost ?? null) : null,
        note: line.note ?? body.description,
      }));

      const moved = await applyStockMovements(
        tx,
        workspaceId,
        {
          referenceType: ADJUSTMENT_REFERENCE,
          referenceId: header.id,
          occurredAt: adjustedAt,
          actorId,
        },
        lines,
      );

      // The service answers in line order, so each line records the cost its
      // own movement went at — the document and its ledger rows agree.
      await tx.stockAdjustmentLine.createMany({
        data: body.lines.map((line, index) => ({
          workspaceId,
          adjustmentId: header.id,
          itemId: line.item_id,
          quantity: lines[index].quantity,
          reason: line.reason,
          note: line.note,
          unitCost: moved[index].unitCost,
        })),
      });

      return tx.stockAdjustment.findFirstOrThrow({
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
