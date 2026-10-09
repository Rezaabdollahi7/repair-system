import { Request, Response } from "express";
import prisma, { runInWorkspaceTransaction } from "../lib/prisma";
import { Prisma } from "../generated/prisma/client";
import { ValidatedRequest } from "../middleware/validate";
import { AuthenticatedRequest } from "../types/request";
import { errorMessage } from "../utils/errors";
import { nextInvoiceNumber } from "../utils/invoiceNumber";
import {
  applyStockMovements,
  InsufficientStockError,
  StockError,
  type StockLine,
} from "../utils/stock";
import { resolveWarehouseId } from "../utils/warehouse";
import { workspaceIdOf } from "../utils/workspace";
import type { IdParam } from "../schemas/common";
import type {
  StockCountAddLineBody,
  StockCountApplyBody,
  StockCountCreateBody,
  StockCountLineParams,
  StockCountLineUpdateBody,
  StockCountListQuery,
} from "../schemas/stockCount";

/*
 * Stock counts (roadmap 14.15) — CNT-0001.
 *
 * Opened for one warehouse and optionally one category, with a line for
 * every active item in scope. The shop counts at its own pace — a line at a
 * time, saved as it goes, from a phone walking the shelves — while the shop
 * keeps selling. So each line keeps the system's quantity at the moment
 * *that line* was counted, and applying posts counted − that snapshot as a
 * `count` movement: a sale made after the shelf was counted is neither
 * undone nor counted twice.
 *
 * Before applying, the review lists the items that moved after they were
 * counted, and applying them needs an explicit acknowledgement: the count
 * may be right, but it is worth a second look.
 *
 * Blind counts hide what the system expects from the counting screen and
 * from the API that serves it — the network tab included — until the count
 * leaves draft. The review, which is the step that compares, shows it.
 */

export const COUNT_REFERENCE = "stock_count";

const NOT_FOUND = "انبارگردانی یافت نشد";

/** A refusal decided inside a transaction, answered outside it. */
class Refusal extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

function answerError(res: Response, error: unknown) {
  if (error instanceof Refusal) {
    return res
      .status(error.status)
      .json({ error: error.message, ...error.extra });
  }
  if (error instanceof InsufficientStockError) {
    // The one way an apply can be refused by the stock itself: the count
    // found less than the snapshot, and more has left since — so the
    // shortage would take the shelf below zero.
    return res.status(400).json({
      error:
        `کسری شمارش «${error.itemName}» از موجودی فعلی بیشتر است ` +
        `(موجودی: ${error.available}). از زمان شمارش این کالا جابه‌جا شده؛ ` +
        "آن را دوباره بشمارید.",
    });
  }
  if (error instanceof StockError) {
    return res.status(400).json({ error: error.message });
  }
  return res.status(500).json({ error: errorMessage(error) });
}

const actorOf = (req: Request) =>
  (req as AuthenticatedRequest).user?.id ?? null;

const nameOf = (
  user: { fullName: string | null; username: string } | null,
): string | null => user?.fullName?.trim() || user?.username || null;

const toNumber = (value: Prisma.Decimal | null): number | null =>
  value === null ? null : value.toNumber();

/** Locks the count row, so an apply and a cancel cannot both happen. */
async function lockCount(
  tx: Prisma.TransactionClient,
  workspaceId: number,
  id: number,
  mode: "update" | "share",
) {
  const rows =
    mode === "update"
      ? await tx.$queryRaw<
          {
            id: number;
            number: string;
            status: string;
            warehouse_id: number;
            blind: boolean;
          }[]
        >`
          SELECT id, number, status::text, warehouse_id, blind FROM stock_counts
          WHERE workspace_id = ${workspaceId} AND id = ${id}
          FOR UPDATE
        `
      : await tx.$queryRaw<
          {
            id: number;
            number: string;
            status: string;
            warehouse_id: number;
            blind: boolean;
          }[]
        >`
          SELECT id, number, status::text, warehouse_id, blind FROM stock_counts
          WHERE workspace_id = ${workspaceId} AND id = ${id}
          FOR SHARE
        `;
  if (rows.length === 0) throw new Refusal(404, NOT_FOUND);
  return rows[0];
}

function requireDraft(status: string) {
  if (status === "applied") {
    throw new Refusal(400, "این انبارگردانی اعمال شده و تغییر نمی‌کند");
  }
  if (status === "cancelled") {
    throw new Refusal(400, "این انبارگردانی لغو شده است");
  }
}

const headerInclude = {
  warehouse: { select: { name: true } },
  category: { select: { name: true } },
  author: { select: { fullName: true, username: true } },
  applier: { select: { fullName: true, username: true } },
} satisfies Prisma.StockCountInclude;

type Header = Prisma.StockCountGetPayload<{ include: typeof headerInclude }>;

function toHeader(count: Header, tally: { lines: number; counted: number }) {
  return {
    id: count.id,
    number: count.number,
    warehouse_id: count.warehouseId,
    warehouse_name: count.warehouse.name,
    category_id: count.categoryId,
    category_name: count.category?.name ?? null,
    blind: count.blind,
    status: count.status,
    description: count.description,
    created_by: count.createdBy,
    created_by_name: nameOf(count.author),
    created_at: count.createdAt.toISOString(),
    applied_at: count.appliedAt?.toISOString() ?? null,
    applied_by_name: nameOf(count.applier),
    cancelled_at: count.cancelledAt?.toISOString() ?? null,
    line_count: tally.lines,
    counted_count: tally.counted,
  };
}

const lineInclude = {
  item: {
    select: {
      code: true,
      name: true,
      unit: true,
      isFractional: true,
      category: { select: { name: true } },
    },
  },
  counter: { select: { fullName: true, username: true } },
} satisfies Prisma.StockCountLineInclude;

type LineRow = Prisma.StockCountLineGetPayload<{ include: typeof lineInclude }>;

/**
 * One line as the counting screen sees it. `expected_quantity` is the
 * snapshot once counted, or what the warehouse holds now if not; with the
 * difference it is withheld while a blind count is still being counted.
 */
function toLine(
  line: LineRow,
  context: { reveal: boolean; current: number; location: string | null },
) {
  const counted = toNumber(line.countedQuantity);
  const system = toNumber(line.systemQuantity);
  const expected = system ?? context.current;
  return {
    id: line.id,
    item_id: line.itemId,
    item_code: line.item.code,
    item_name: line.item.name,
    item_unit: line.item.unit,
    item_is_fractional: line.item.isFractional,
    category_name: line.item.category?.name ?? null,
    location: context.location,
    counted_quantity: counted,
    counted_at: line.countedAt?.toISOString() ?? null,
    counted_by_name: nameOf(line.counter),
    note: line.note,
    expected_quantity: context.reveal ? expected : null,
    difference:
      context.reveal && counted !== null && system !== null
        ? Math.round((counted - system) * 1000) / 1000
        : null,
    applied_quantity: toNumber(line.appliedQuantity),
    unit_cost: toNumber(line.unitCost),
  };
}

/** Each line's warehouse quantity and shelf location, in one read. */
async function stockContext(
  client: Prisma.TransactionClient | typeof prisma,
  workspaceId: number,
  warehouseId: number,
  itemIds: number[],
) {
  const stocks = await client.itemStock.findMany({
    where: { workspaceId, warehouseId, itemId: { in: itemIds } },
    select: { itemId: true, quantity: true, location: true },
  });
  return new Map(
    stocks.map((s) => [
      s.itemId,
      { current: s.quantity.toNumber(), location: s.location },
    ]),
  );
}

async function detail(
  client: Prisma.TransactionClient | typeof prisma,
  workspaceId: number,
  id: number,
) {
  const count = await client.stockCount.findFirst({
    where: { id, workspaceId },
    include: headerInclude,
  });
  if (!count) return null;

  const lines = await client.stockCountLine.findMany({
    where: { countId: id, workspaceId },
    include: lineInclude,
    orderBy: [{ item: { name: "asc" } }, { id: "asc" }],
  });
  const context = await stockContext(
    client,
    workspaceId,
    count.warehouseId,
    lines.map((line) => line.itemId),
  );
  const reveal = !(count.blind && count.status === "draft");

  return {
    ...toHeader(count, {
      lines: lines.length,
      counted: lines.filter((line) => line.countedQuantity !== null).length,
    }),
    lines: lines.map((line) => {
      const stock = context.get(line.itemId);
      return toLine(line, {
        reveal,
        current: stock?.current ?? 0,
        location: stock?.location ?? null,
      });
    }),
  };
}

/**
 * One line, for the counting screen's save — not the whole count, which a
 * phone saving row by row would otherwise reload a thousand lines at a time.
 */
async function oneLine(
  tx: Prisma.TransactionClient,
  workspaceId: number,
  count: { warehouse_id: number; blind: boolean; status: string },
  lineId: number,
) {
  const line = await tx.stockCountLine.findFirstOrThrow({
    where: { id: lineId, workspaceId },
    include: lineInclude,
  });
  const stock = (
    await stockContext(tx, workspaceId, count.warehouse_id, [line.itemId])
  ).get(line.itemId);
  return toLine(line, {
    reveal: !(count.blind && count.status === "draft"),
    current: stock?.current ?? 0,
    location: stock?.location ?? null,
  });
}

// GET /api/stock-counts
export const getAll = async (req: Request, res: Response) => {
  try {
    const query = (req as ValidatedRequest).valid.query as StockCountListQuery;
    const { page, limit } = query;
    const workspaceId = workspaceIdOf(req);

    const where: Prisma.StockCountWhereInput = { workspaceId };
    if (query.status) where.status = query.status;
    if (query.warehouse_id !== undefined)
      where.warehouseId = query.warehouse_id;

    const [total, counts] = await Promise.all([
      prisma.stockCount.count({ where }),
      prisma.stockCount.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: headerInclude,
      }),
    ]);

    // How far each count has got, for the progress shown in the list.
    const ids = counts.map((count) => count.id);
    const [allLines, countedLines] = ids.length
      ? await Promise.all([
          prisma.stockCountLine.groupBy({
            by: ["countId"],
            where: { workspaceId, countId: { in: ids } },
            _count: { _all: true },
          }),
          prisma.stockCountLine.groupBy({
            by: ["countId"],
            where: {
              workspaceId,
              countId: { in: ids },
              countedQuantity: { not: null },
            },
            _count: { _all: true },
          }),
        ])
      : [[], []];
    const linesOf = new Map(allLines.map((r) => [r.countId, r._count._all]));
    const countedOf = new Map(
      countedLines.map((r) => [r.countId, r._count._all]),
    );

    res.json({
      data: counts.map((count) =>
        toHeader(count, {
          lines: linesOf.get(count.id) ?? 0,
          counted: countedOf.get(count.id) ?? 0,
        }),
      ),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    answerError(res, error);
  }
};

// GET /api/stock-counts/:id
export const getById = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;
    const result = await detail(prisma, workspaceIdOf(req), id);
    if (!result) return res.status(404).json({ error: NOT_FOUND });
    res.json(result);
  } catch (error) {
    answerError(res, error);
  }
};

// POST /api/stock-counts
export const create = async (req: Request, res: Response) => {
  try {
    const body = (req as ValidatedRequest).valid.body as StockCountCreateBody;
    const workspaceId = workspaceIdOf(req);

    const result = await runInWorkspaceTransaction(workspaceId, async (tx) => {
      const warehouseId = await resolveWarehouseId(
        tx,
        workspaceId,
        body.warehouse_id,
      );

      if (body.category_id) {
        const category = await tx.category.findFirst({
          where: { id: body.category_id, workspaceId },
          select: { id: true },
        });
        if (!category) throw new Refusal(400, "دسته‌بندی یافت نشد");
      }

      // The scope, fixed now. An item added to the catalogue later is not
      // in this count unless someone adds it (POST /:id/lines).
      const items = await tx.item.findMany({
        where: {
          workspaceId,
          isActive: true,
          ...(body.category_id ? { categoryId: body.category_id } : {}),
        },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      if (items.length === 0) {
        throw new Refusal(400, "کالایی برای شمارش در این دامنه نیست");
      }

      const number = await nextInvoiceNumber(tx, workspaceId, "count");
      const count = await tx.stockCount.create({
        data: {
          workspaceId,
          number,
          warehouseId,
          categoryId: body.category_id ?? null,
          blind: body.blind,
          description: body.description,
          createdBy: actorOf(req),
        },
        select: { id: true },
      });
      await tx.stockCountLine.createMany({
        data: items.map((item) => ({
          workspaceId,
          countId: count.id,
          itemId: item.id,
        })),
      });

      return detail(tx, workspaceId, count.id);
    });

    res.status(201).json(result);
  } catch (error) {
    answerError(res, error);
  }
};

// PUT /api/stock-counts/:id/lines/:lineId
export const updateLine = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id, lineId } = valid.params as StockCountLineParams;
    const body = valid.body as StockCountLineUpdateBody;
    const workspaceId = workspaceIdOf(req);

    const result = await runInWorkspaceTransaction(workspaceId, async (tx) => {
      // Shared: many lines may be saved at once from several phones, but
      // none while the count is being applied or cancelled.
      const count = await lockCount(tx, workspaceId, id, "share");
      requireDraft(count.status);

      const line = await tx.stockCountLine.findFirst({
        where: { id: lineId, countId: id, workspaceId },
        include: { item: { select: { name: true, isFractional: true } } },
      });
      if (!line) throw new Refusal(404, "این ردیف در شمارش نیست");

      const counted = body.counted_quantity;
      if (
        counted !== null &&
        !line.item.isFractional &&
        !Number.isInteger(counted)
      ) {
        throw new Refusal(
          400,
          `کالای «${line.item.name}» فقط عدد صحیح می‌پذیرد`,
        );
      }

      // The snapshot this count will be measured against: what the system
      // says for this warehouse now, at the moment the shelf was counted.
      let system: Prisma.Decimal | null = null;
      if (counted !== null) {
        const stock = await tx.itemStock.findUnique({
          where: {
            itemId_warehouseId: {
              itemId: line.itemId,
              warehouseId: count.warehouse_id,
            },
          },
          select: { quantity: true },
        });
        system = stock?.quantity ?? new Prisma.Decimal(0);
      }

      await tx.stockCountLine.updateMany({
        where: { id: lineId, workspaceId },
        data: {
          countedQuantity: counted,
          systemQuantity: system,
          countedAt: counted === null ? null : new Date(),
          countedBy: counted === null ? null : actorOf(req),
          note: body.note,
        },
      });

      return oneLine(tx, workspaceId, count, lineId);
    });

    res.json(result);
  } catch (error) {
    answerError(res, error);
  }
};

// POST /api/stock-counts/:id/lines
export const addLine = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const body = valid.body as StockCountAddLineBody;
    const workspaceId = workspaceIdOf(req);

    const result = await runInWorkspaceTransaction(workspaceId, async (tx) => {
      const count = await lockCount(tx, workspaceId, id, "share");
      requireDraft(count.status);

      const item = await tx.item.findFirst({
        where: { id: body.item_id, workspaceId },
        select: { id: true },
      });
      if (!item) throw new Refusal(400, "کالا یافت نشد");

      const existing = await tx.stockCountLine.findFirst({
        where: { countId: id, itemId: item.id, workspaceId },
        select: { id: true },
      });
      if (existing) throw new Refusal(400, "این کالا در شمارش هست");

      const line = await tx.stockCountLine.create({
        data: { workspaceId, countId: id, itemId: item.id },
        select: { id: true },
      });
      return oneLine(tx, workspaceId, count, line.id);
    });

    res.status(201).json(result);
  } catch (error) {
    answerError(res, error);
  }
};

/**
 * The comparison: every counted line against its snapshot, and whether the
 * item moved in this warehouse after it was counted.
 */
async function reviewOf(
  client: Prisma.TransactionClient | typeof prisma,
  workspaceId: number,
  count: { id: number; warehouse_id: number },
) {
  const lines = await client.stockCountLine.findMany({
    where: { countId: count.id, workspaceId },
    include: {
      item: {
        select: { code: true, name: true, unit: true, avgPurchasePrice: true },
      },
    },
    orderBy: [{ item: { name: "asc" } }, { id: "asc" }],
  });

  const counted = lines.filter((line) => line.countedQuantity !== null);
  const earliest = counted.reduce<Date | null>(
    (min, line) => (!min || line.countedAt! < min ? line.countedAt! : min),
    null,
  );

  // Movements after the earliest count, for the counted items; matched to
  // each line's own moment below.
  const later = earliest
    ? await client.inventoryTransaction.findMany({
        where: {
          workspaceId,
          warehouseId: count.warehouse_id,
          itemId: { in: counted.map((line) => line.itemId) },
          createdAt: { gt: earliest },
        },
        select: { itemId: true, createdAt: true },
      })
    : [];

  const current = await stockContext(
    client,
    workspaceId,
    count.warehouse_id,
    counted.map((line) => line.itemId),
  );

  const rows = counted.map((line) => {
    const countedQty = line.countedQuantity!.toNumber();
    const system = line.systemQuantity!.toNumber();
    const difference = Math.round((countedQty - system) * 1000) / 1000;
    const avg = line.item.avgPurchasePrice.toNumber();
    return {
      line_id: line.id,
      item_id: line.itemId,
      item_code: line.item.code,
      item_name: line.item.name,
      item_unit: line.item.unit,
      counted_quantity: countedQty,
      system_quantity: system,
      difference,
      current_quantity: current.get(line.itemId)?.current ?? 0,
      moved_since: later.some(
        (move) =>
          move.itemId === line.itemId && move.createdAt > line.countedAt!,
      ),
      value: Math.round(difference * avg * 100) / 100,
      counted_at: line.countedAt!.toISOString(),
    };
  });

  const surplus = rows.filter((r) => r.difference > 0);
  const shortage = rows.filter((r) => r.difference < 0);

  return {
    lines: rows,
    summary: {
      line_count: lines.length,
      counted_count: counted.length,
      uncounted_count: lines.length - counted.length,
      matching_count: rows.filter((r) => r.difference === 0).length,
      surplus_count: surplus.length,
      shortage_count: shortage.length,
      surplus_value:
        Math.round(surplus.reduce((s, r) => s + r.value, 0) * 100) / 100,
      shortage_value:
        Math.round(-shortage.reduce((s, r) => s + r.value, 0) * 100) / 100,
      moved_count: rows.filter((r) => r.moved_since).length,
    },
  };
}

// GET /api/stock-counts/:id/review
export const review = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;
    const workspaceId = workspaceIdOf(req);

    const result = await runInWorkspaceTransaction(workspaceId, async (tx) => {
      const count = await lockCount(tx, workspaceId, id, "share");
      return reviewOf(tx, workspaceId, count);
    });

    res.json(result);
  } catch (error) {
    answerError(res, error);
  }
};

// POST /api/stock-counts/:id/apply
export const apply = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const body = valid.body as StockCountApplyBody;
    const workspaceId = workspaceIdOf(req);
    const actorId = actorOf(req);

    const result = await runInWorkspaceTransaction(workspaceId, async (tx) => {
      // FOR UPDATE: two applies, or an apply and a cancel, queue here and
      // the second finds the count no longer a draft.
      const count = await lockCount(tx, workspaceId, id, "update");
      requireDraft(count.status);

      const { lines, summary } = await reviewOf(tx, workspaceId, count);
      if (summary.counted_count === 0) {
        throw new Refusal(400, "هنوز هیچ ردیفی شمرده نشده است");
      }

      const moved = lines.filter((line) => line.moved_since);
      if (moved.length > 0 && !body.acknowledge_moved) {
        throw new Refusal(
          409,
          `${moved.length} کالا پس از شمارش جابه‌جا شده‌اند. پیش از اعمال، آن‌ها را بررسی کنید`,
          {
            moved: moved.map((line) => ({
              item_id: line.item_id,
              item_name: line.item_name,
            })),
          },
        );
      }

      const changes = lines.filter((line) => line.difference !== 0);
      const appliedAt = new Date();

      const stockLines: StockLine[] = changes.map((line) => ({
        itemId: line.item_id,
        warehouseId: count.warehouse_id,
        quantity: line.difference,
        type: "count",
        reason: "count",
        note: `انبارگردانی ${count.number}`,
      }));
      const movedRows = await applyStockMovements(
        tx,
        workspaceId,
        {
          referenceType: COUNT_REFERENCE,
          referenceId: id,
          occurredAt: appliedAt,
          actorId,
        },
        stockLines,
      );

      // Each changed line records what it posted and the cost it moved at.
      for (const [index, line] of changes.entries()) {
        await tx.stockCountLine.updateMany({
          where: { id: line.line_id, workspaceId },
          data: {
            appliedQuantity: line.difference,
            unitCost: movedRows[index].unitCost,
          },
        });
      }

      await tx.stockCount.updateMany({
        where: { id, workspaceId },
        data: { status: "applied", appliedAt, appliedBy: actorId },
      });

      return detail(tx, workspaceId, id);
    });

    res.json(result);
  } catch (error) {
    answerError(res, error);
  }
};

// POST /api/stock-counts/:id/cancel
export const cancel = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;
    const workspaceId = workspaceIdOf(req);

    const result = await runInWorkspaceTransaction(workspaceId, async (tx) => {
      const count = await lockCount(tx, workspaceId, id, "update");
      requireDraft(count.status);
      await tx.stockCount.updateMany({
        where: { id, workspaceId },
        data: { status: "cancelled", cancelledAt: new Date() },
      });
      return detail(tx, workspaceId, id);
    });

    res.json(result);
  } catch (error) {
    answerError(res, error);
  }
};
