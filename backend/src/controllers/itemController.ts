import { Request, Response } from "express";
import prisma, { runInWorkspaceTransaction } from "../lib/prisma";
import { Prisma } from "../generated/prisma/client";
import { ValidatedRequest } from "../middleware/validate";
import { AuthenticatedRequest } from "../types/request";
import { errorMessage, isUniqueConstraintError } from "../utils/errors";
import persianToEnglish from "../utils/persianToEnglish";
import type { IdParam } from "../schemas/common";
import type {
  InvoiceSearchQuery,
  ItemCreateBody,
  ItemListQuery,
  ItemSearchQuery,
  ItemKardexQuery,
  ItemTransactionsQuery,
  ItemUpdateBody,
  QuickPurchaseBody,
  QuickSaleBody,
  StockFilter,
} from "../schemas/item";
import { nextInvoiceNumber } from "../utils/invoiceNumber";
import { workspaceIdOf } from "../utils/workspace";
import { dateFilter } from "../utils/dateRange";
import { lineTotals } from "../utils/invoiceTotals";
import {
  applyStockMovements,
  InsufficientStockError,
  StockError,
  type StockLine,
} from "../utils/stock";
import { resolveWarehouseId } from "../utils/warehouse";

const itemInclude = {
  category: { select: { name: true } },
} satisfies Prisma.ItemInclude;

type ItemWithCategory = Prisma.ItemGetPayload<{ include: typeof itemInclude }>;

/**
 * Item endpoints answer in camelCase, unlike most of the API — serialize()
 * would rewrite these keys to snake_case and break the frontend. The two
 * exceptions (transactions and invoice search) are mapped separately below,
 * because they have always answered in snake_case.
 */
function toItemResponse(item: ItemWithCategory) {
  return {
    id: item.id,
    categoryId: item.categoryId,
    name: item.name,
    code: item.code,
    unit: item.unit,
    minStock: item.minStock.toNumber(),
    currentStock: item.currentStock.toNumber(),
    avgPurchasePrice: item.avgPurchasePrice.toNumber(),
    isFractional: item.isFractional,
    description: item.description,
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    sellPrice: item.sellPrice.toNumber(),
    categoryName: item.category?.name ?? null,
  };
}

const DUPLICATE_CODE = { error: "این کد کالا قبلاً ثبت شده است" };

// ── Opening balance ──────────────────────────────────────────

/**
 * The reference type on a correction of an item's opening balance. Both rows
 * a correction writes — the new opening and the reversal of the old one —
 * carry it, with the id of the opening row being replaced. That id is what
 * marks an opening as superseded: the ledger is append-only, so the old row
 * stays where it is and the reversal beside it says it no longer counts.
 */
const OPENING_REFERENCE = "item_opening";

const OPENING_NOTE = "اصلاح موجودی اولیه";

/** The ledger rows that make up an item's opening balance, newest first. */
function openingRowsQuery(workspaceId: number, itemId: number) {
  return {
    where: {
      workspaceId,
      itemId,
      OR: [
        { type: "opening" as const },
        { type: "reversal" as const, referenceType: OPENING_REFERENCE },
      ],
    },
    orderBy: { id: "desc" as const },
    select: {
      id: true,
      type: true,
      quantity: true,
      unitCost: true,
      warehouseId: true,
      referenceId: true,
      occurredAt: true,
    },
  } satisfies Prisma.InventoryTransactionFindManyArgs;
}

type OpeningRow = Prisma.InventoryTransactionGetPayload<
  ReturnType<typeof openingRowsQuery>
>;

/**
 * The opening balance that still counts: the newest opening row no reversal
 * points at. Null when the item opened with nothing, or its opening has been
 * corrected down to nothing.
 */
function liveOpening(rows: OpeningRow[]): OpeningRow | null {
  const superseded = new Set(
    rows.filter((row) => row.type === "reversal").map((row) => row.referenceId),
  );
  return (
    rows.find((row) => row.type === "opening" && !superseded.has(row.id)) ??
    null
  );
}

/**
 * Movements that leave or arrive at the moving average rather than at a cost
 * of their own. A sale, a part on a repair, a count or a breakage takes its
 * share of every unit's value with it; a purchase, an opening, a reversal or
 * a return brings or removes a fixed amount. A transfer is a pair at the
 * average whose two halves cancel. An adjustment *in* may or may not have
 * named its cost, and the ledger cannot tell which; it is read as fixed.
 */
const AT_AVERAGE = new Set([
  "sale",
  "repair_use",
  "count",
  "transfer_out",
  "transfer_in",
]);

/**
 * How much of an opening's value is still on the shelf, as a fraction.
 *
 * Under a moving average every unit is alike, so each movement at the
 * average keeps the same fraction of every layer of value: ten opened, three
 * sold, and seven-tenths of what the opening was worth is still in the stock
 * — whatever was bought before or after. Walked from the opening forwards,
 * on the item's total, which is what the average is kept over.
 */
async function openingRetention(
  tx: Prisma.TransactionClient,
  workspaceId: number,
  itemId: number,
  openingId: number,
): Promise<number> {
  const before = await tx.inventoryTransaction.aggregate({
    where: { workspaceId, itemId, id: { lte: openingId } },
    _sum: { quantity: true },
  });
  const after = await tx.inventoryTransaction.findMany({
    where: { workspaceId, itemId, id: { gt: openingId } },
    orderBy: { id: "asc" },
    select: { type: true, quantity: true },
  });

  let stock = before._sum.quantity?.toNumber() ?? 0;
  let retention = 1;
  for (const row of after) {
    const quantity = row.quantity.toNumber();
    const atAverage =
      AT_AVERAGE.has(row.type) || (row.type === "adjustment" && quantity < 0);
    if (atAverage && stock > 0) {
      retention *= Math.max(0, stock + quantity) / stock;
    }
    stock += quantity;
  }
  return retention;
}

/**
 * Brings an item's opening balance to what the edit form now says.
 *
 * Written the way a purchase invoice edit is: the new opening goes in, then
 * the old one comes out, in one call to the stock service. Adding first means
 * an item whose opening stock has partly been sold can still be corrected —
 * ten in, three sold, edited from ۱۰۰ میلیون to ۱۰ — without dipping below
 * zero on the way. Both rows stay on the kardex, dated with the original
 * opening, so a period report reads the corrected figure and the history
 * still shows it was corrected.
 *
 * ⚠️ The old opening does not always come out at the cost it came in at.
 * While all of it is still on the shelf it does, and the average lands
 * exactly where it would have stood had the right cost been typed. Once some
 * has been sold, the sold units took the old cost with them — onto their
 * invoice lines, where it stays — so taking the whole old value back out
 * would remove value the shelf no longer holds: in the example above, the
 * average went to zero. It leaves instead at a blend, the old cost for the
 * share still on the shelf and the new one for the rest, which is exactly
 * the average a corrected history would have reached.
 */
async function correctOpening(
  tx: Prisma.TransactionClient,
  workspaceId: number,
  item: { id: number; name: string; createdAt: Date },
  actorId: number | null,
  target: {
    quantity: number;
    unitCost: number | null | undefined;
    warehouseId: number | null | undefined;
  },
): Promise<void> {
  const live = liveOpening(
    await tx.inventoryTransaction.findMany(
      openingRowsQuery(workspaceId, item.id),
    ),
  );

  const warehouseId =
    target.quantity > 0
      ? await resolveWarehouseId(
          tx,
          workspaceId,
          target.warehouseId ?? live?.warehouseId,
        )
      : null;

  const unchanged = live
    ? live.quantity.toNumber() === target.quantity &&
      (live.unitCost?.toNumber() ?? 0) === (target.unitCost ?? 0) &&
      live.warehouseId === warehouseId
    : target.quantity === 0;
  if (unchanged) return;

  let reversalCost = live?.unitCost?.toNumber();
  if (live && reversalCost !== undefined) {
    const retention = await openingRetention(tx, workspaceId, item.id, live.id);
    if (retention < 1) {
      // What the units that are not the opening's any more are worth now:
      // the corrected cost, or — when the opening is being removed — the
      // shelf's own average.
      const replacement =
        target.quantity > 0
          ? target.unitCost!
          : await currentAverage(tx, workspaceId, item.id);
      reversalCost = retention * reversalCost + (1 - retention) * replacement;
    }
  }

  const lines: StockLine[] = [];
  if (target.quantity > 0) {
    lines.push({
      itemId: item.id,
      warehouseId: warehouseId!,
      quantity: target.quantity,
      type: "opening",
      unitCost: target.unitCost!,
      note: OPENING_NOTE,
    });
  }
  if (live) {
    lines.push({
      itemId: item.id,
      warehouseId: live.warehouseId,
      quantity: -live.quantity.toNumber(),
      type: "reversal",
      unitCost: reversalCost,
      note: OPENING_NOTE,
    });
  }

  try {
    await applyStockMovements(
      tx,
      workspaceId,
      {
        referenceType: OPENING_REFERENCE,
        referenceId: live?.id ?? null,
        occurredAt: live?.occurredAt ?? item.createdAt,
        actorId,
      },
      lines,
    );
  } catch (error) {
    // The service's own message names quantities but not why they matter
    // here: the only way a correction runs short is stock that has already
    // left the warehouse it opened in.
    if (error instanceof InsufficientStockError) {
      throw new StockError(
        `بخشی از موجودی اولیه‌ی «${item.name}» فروخته، مصرف یا جابه‌جا شده است؛ ` +
          `با این تغییر موجودی انبار منفی می‌شود (موجودی فعلی آن انبار: ${toPersianDigits(error.available)}).`,
      );
    }
    throw error;
  }
}

/** The item's average, read under the lock the stock service will take
 * anyway — items first, as its lock order says. */
async function currentAverage(
  tx: Prisma.TransactionClient,
  workspaceId: number,
  itemId: number,
): Promise<number> {
  const rows = await tx.$queryRaw<{ avg: Prisma.Decimal | string }[]>`
    SELECT avg_purchase_price AS avg FROM items
    WHERE id = ${itemId} AND workspace_id = ${workspaceId}
    FOR UPDATE`;
  return Number(rows[0]?.avg ?? 0);
}

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function toPersianDigits(value: number | string): string {
  return String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/**
 * The where fragment for one stock bucket.
 *
 * `low` and `ok` compare two columns of the same row, which is what Prisma's
 * field references are for — `prisma.item.fields.minStock` becomes a column
 * reference in the generated SQL rather than a bound value. That matters
 * here: it keeps the filter in the database, so the count and the page still
 * come from one indexed query.
 *
 * The alternative was what getLowStock below still does — load the whole
 * catalogue and filter in JS — which the list cannot use, because it also has
 * to paginate and report a total. The page filtered its own rows client-side
 * before this existed, so a workshop asking for its low-stock items got only
 * the low-stock rows that happened to be on page one, under a total that
 * counted everything.
 *
 * The three buckets match stockStatus() in the report controller exactly,
 * `out` first: an item with minStock 0 and nothing in stock is out, not ok.
 */
function stockWhere(stock: StockFilter): Prisma.ItemWhereInput {
  if (stock === "out") return { currentStock: { lte: 0 } };
  if (stock === "low") {
    return {
      currentStock: { gt: 0, lte: prisma.item.fields.minStock },
    };
  }
  return { currentStock: { gt: prisma.item.fields.minStock } };
}

function paginate<T>(data: T[], total: number, page: number, limit: number) {
  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// GET /api/items
export const getAll = async (req: Request, res: Response) => {
  try {
    const { categoryId, stock, page, limit } = (req as ValidatedRequest).valid
      .query as ItemListQuery;

    const where: Prisma.ItemWhereInput = { workspaceId: workspaceIdOf(req) };
    if (categoryId !== undefined) {
      where.categoryId = categoryId;
    }
    if (stock !== undefined) {
      Object.assign(where, stockWhere(stock));
    }

    const [total, items] = await Promise.all([
      prisma.item.count({ where }),
      prisma.item.findMany({
        where,
        orderBy: { code: "asc" },
        skip: (page - 1) * limit,
        take: limit,
        include: itemInclude,
      }),
    ]);

    res.json(paginate(items.map(toItemResponse), total, page, limit));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/items/:id
export const getById = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;

    // findFirst rather than findUnique: the id alone would resolve an item
    // belonging to another workspace.
    const item = await prisma.item.findFirst({
      where: { id, workspaceId: workspaceIdOf(req) },
      include: {
        ...itemInclude,
        stocks: {
          orderBy: { warehouseId: "asc" },
          include: { warehouse: { select: { name: true, isActive: true } } },
        },
      },
    });

    if (!item) {
      return res.status(404).json({ error: "کالا یافت نشد" });
    }

    const opening = liveOpening(
      await prisma.inventoryTransaction.findMany(
        openingRowsQuery(item.workspaceId, item.id),
      ),
    );

    res.json({
      ...toItemResponse(item),
      // What the edit form shows in its opening-stock fields.
      opening: opening
        ? {
            quantity: opening.quantity.toNumber(),
            unitCost: opening.unitCost?.toNumber() ?? null,
            warehouseId: opening.warehouseId,
          }
        : null,
      // Where the total is kept. Rows at zero stay: a warehouse that has held
      // the item is one the shop may look for it in.
      stocks: item.stocks.map((stock) => ({
        warehouseId: stock.warehouseId,
        warehouseName: stock.warehouse.name,
        warehouseActive: stock.warehouse.isActive,
        quantity: stock.quantity.toNumber(),
        location: stock.location,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/items/units
//
// The units this shop has already counted something in, beside the defaults
// the frontend offers. A unit is just the text on an item — there is no
// table of them — so a unit a shop adds ("حلقه", "شاخه") joins the list the
// moment the first item is saved with it.
export const getUnits = async (req: Request, res: Response) => {
  try {
    const rows = await prisma.item.findMany({
      where: { workspaceId: workspaceIdOf(req) },
      distinct: ["unit"],
      select: { unit: true },
      orderBy: { unit: "asc" },
    });
    res.json(
      rows.map((row) => row.unit.trim()).filter((unit) => unit.length > 0),
    );
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/items/search
export const search = async (req: Request, res: Response) => {
  try {
    const { q, categoryId, stock, page, limit } = (req as ValidatedRequest)
      .valid.query as ItemSearchQuery;

    const where: Prisma.ItemWhereInput = { workspaceId: workspaceIdOf(req) };

    if (q) {
      const term = persianToEnglish(q).replace(/\s+/g, " ");
      where.OR = [
        { code: { contains: term, mode: "insensitive" } },
        { name: { contains: term, mode: "insensitive" } },
      ];
    }

    if (categoryId !== undefined) {
      where.categoryId = categoryId;
    }
    if (stock !== undefined) {
      Object.assign(where, stockWhere(stock));
    }

    const [total, items] = await Promise.all([
      prisma.item.count({ where }),
      prisma.item.findMany({
        where,
        orderBy: { code: "asc" },
        skip: (page - 1) * limit,
        take: limit,
        include: itemInclude,
      }),
    ]);

    res.json(paginate(items.map(toItemResponse), total, page, limit));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/items/low-stock
export const getLowStock = async (req: Request, res: Response) => {
  try {
    // Filtered and sorted in JS: both the condition and the ordering compare
    // two columns against each other, which Prisma can't express in where or
    // orderBy. Raw SQL would bypass the Prisma Client extension that scopes
    // queries by workspaceId in phase 2, and a single workshop's catalogue is
    // small enough that loading it costs little.
    const items = await prisma.item.findMany({
      where: { workspaceId: workspaceIdOf(req) },
      include: itemInclude,
    });

    const lowStock = items
      .filter(
        (item) => item.currentStock.toNumber() <= item.minStock.toNumber(),
      )
      .sort(
        (a, b) =>
          b.minStock.toNumber() -
          b.currentStock.toNumber() -
          (a.minStock.toNumber() - a.currentStock.toNumber()),
      );

    res.json(lowStock.map(toItemResponse));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/items/search/for-invoice
export const searchForInvoice = async (req: Request, res: Response) => {
  try {
    const { q, limit } = (req as ValidatedRequest).valid
      .query as InvoiceSearchQuery;

    const where: Prisma.ItemWhereInput = {
      workspaceId: workspaceIdOf(req),
      isActive: true,
      currentStock: { gt: 0 },
    };

    if (q) {
      const term = persianToEnglish(q).replace(/\s+/g, " ");
      where.OR = [
        { code: { contains: term, mode: "insensitive" } },
        { name: { contains: term, mode: "insensitive" } },
      ];
    }

    const items = await prisma.item.findMany({
      where,
      orderBy: { name: "asc" },
      take: limit,
      include: itemInclude,
    });

    // snake_case here, unlike the other item endpoints — preserved as-is.
    res.json(
      items.map((item) => ({
        id: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit,
        current_stock: item.currentStock.toNumber(),
        avg_purchase_price: item.avgPurchasePrice.toNumber(),
        sell_price: item.sellPrice.toNumber(),
        category_name: item.category?.name ?? null,
        // The repair form steps its quantity field by this (14.11).
        is_fractional: item.isFractional,
      })),
    );
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/items/:id/transactions
export const getTransactions = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const { page, limit } = valid.query as ItemTransactionsQuery;

    const workspaceId = workspaceIdOf(req);

    const item = await prisma.item.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!item) {
      return res.status(404).json({ error: "کالا یافت نشد" });
    }

    const where: Prisma.InventoryTransactionWhereInput = {
      itemId: id,
      workspaceId,
    };

    const [total, transactions] = await Promise.all([
      prisma.inventoryTransaction.count({ where }),
      prisma.inventoryTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // referenceId is a polymorphic pointer with no foreign key, so the
    // purchase invoice numbers are fetched separately rather than joined.
    const purchaseIds = transactions
      .filter((tx) => tx.referenceType === "purchase_invoice" && tx.referenceId)
      .map((tx) => tx.referenceId as number);

    const invoices = purchaseIds.length
      ? await prisma.purchaseInvoice.findMany({
          where: { id: { in: purchaseIds }, workspaceId },
          select: { id: true, invoiceNumber: true },
        })
      : [];

    const invoiceNumbers = new Map(
      invoices.map((invoice) => [invoice.id, invoice.invoiceNumber]),
    );

    const data = transactions.map((tx) => ({
      id: tx.id,
      item_id: tx.itemId,
      type: tx.type,
      quantity: tx.quantity.toNumber(),
      unit_price: tx.unitPrice.toNumber(),
      unit_cost: tx.unitCost?.toNumber() ?? null,
      warehouse_id: tx.warehouseId,
      before_quantity: tx.beforeQuantity?.toNumber() ?? null,
      after_quantity: tx.afterQuantity?.toNumber() ?? null,
      reason: tx.reason,
      occurred_at: tx.occurredAt.toISOString(),
      reference_id: tx.referenceId,
      reference_type: tx.referenceType,
      note: tx.note,
      created_by: tx.createdBy,
      created_at: tx.createdAt.toISOString(),
      purchase_invoice_number:
        tx.referenceType === "purchase_invoice" && tx.referenceId
          ? (invoiceNumbers.get(tx.referenceId) ?? null)
          : null,
    }));

    res.json(paginate(data, total, page, limit));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

/** How many invoice lines the trade tab shows; the totals cover them all. */
const TRADE_ROWS = 100;

/** Repair invoices whose parts have left the shelf (14.6). */
const REPAIR_MOVED: ("issued" | "paid")[] = ["issued", "paid"];

// GET /api/items/:id/trade
//
// The item page's «خرید و فروش» tab (14.18): every invoice line that names
// this item — bought, sold over the counter, fitted on a repair — newest
// first, with a total per kind. The totals are aggregates over every line,
// not sums of the rows returned, which stop at TRADE_ROWS.
//
// A repair line counts only once its invoice has been issued: a پیش‌فاکتور
// has moved nothing, and a cancelled invoice has put its parts back. Both
// are still listed, with their status, because the shop quoted that part.
export const getTrade = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;
    const workspaceId = workspaceIdOf(req);

    const item = await prisma.item.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!item) {
      return res.status(404).json({ error: "کالا یافت نشد" });
    }

    const purchaseWhere = { itemId: id, workspaceId };
    const saleWhere = { itemId: id, workspaceId };
    // Repair lines are not a relation to items (itemId can name a service),
    // so the type is part of the filter.
    const repairWhere: Prisma.RepairInvoiceItemWhereInput = {
      itemId: id,
      itemType: "inventory",
      workspaceId,
    };
    const newest = { invoice: { invoiceDate: "desc" as const } };

    const [
      purchases,
      sales,
      repairs,
      purchaseTotals,
      saleTotals,
      repairTotals,
    ] = await Promise.all([
      prisma.purchaseInvoiceItem.findMany({
        where: purchaseWhere,
        orderBy: [newest, { id: "desc" }],
        take: TRADE_ROWS,
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              invoiceDate: true,
              supplierName: true,
              paymentStatus: true,
            },
          },
        },
      }),
      prisma.saleInvoiceItem.findMany({
        where: saleWhere,
        orderBy: [newest, { id: "desc" }],
        take: TRADE_ROWS,
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              invoiceDate: true,
              customerName: true,
              paymentStatus: true,
              customer: { select: { name: true } },
            },
          },
        },
      }),
      prisma.repairInvoiceItem.findMany({
        where: repairWhere,
        orderBy: [newest, { id: "desc" }],
        take: TRADE_ROWS,
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              invoiceDate: true,
              customerName: true,
              status: true,
              customer: { select: { name: true } },
            },
          },
        },
      }),
      prisma.purchaseInvoiceItem.aggregate({
        where: purchaseWhere,
        _count: true,
        _sum: { quantity: true, totalPrice: true },
      }),
      prisma.saleInvoiceItem.aggregate({
        where: saleWhere,
        _count: true,
        _sum: { quantity: true, totalPrice: true },
      }),
      prisma.repairInvoiceItem.aggregate({
        where: {
          ...repairWhere,
          invoice: { status: { in: REPAIR_MOVED } },
        },
        _count: true,
        _sum: { quantity: true, totalPrice: true },
      }),
    ]);

    const rows = [
      ...purchases.map((line) => ({
        kind: "purchase" as const,
        line_id: line.id,
        invoice_id: line.invoice.id,
        invoice_number: line.invoice.invoiceNumber,
        invoice_date: line.invoice.invoiceDate.toISOString(),
        party: line.invoice.supplierName,
        quantity: line.quantity.toNumber(),
        unit_price: line.unitPrice.toNumber(),
        total_price: line.totalPrice.toNumber(),
        status: line.invoice.paymentStatus,
      })),
      ...sales.map((line) => ({
        kind: "sale" as const,
        line_id: line.id,
        invoice_id: line.invoice.id,
        invoice_number: line.invoice.invoiceNumber,
        invoice_date: line.invoice.invoiceDate.toISOString(),
        party: line.invoice.customer?.name ?? line.invoice.customerName,
        quantity: line.quantity.toNumber(),
        unit_price: line.unitPrice.toNumber(),
        total_price: line.totalPrice.toNumber(),
        status: line.invoice.paymentStatus,
      })),
      ...repairs.map((line) => ({
        kind: "repair" as const,
        line_id: line.id,
        invoice_id: line.invoice.id,
        invoice_number: line.invoice.invoiceNumber,
        invoice_date: line.invoice.invoiceDate.toISOString(),
        party: line.invoice.customer?.name ?? line.invoice.customerName,
        quantity: line.quantity.toNumber(),
        unit_price: line.unitPrice.toNumber(),
        total_price: line.totalPrice.toNumber(),
        // The repair invoice's own status, not its payment: whether the part
        // has left the shelf is the question this column answers.
        status: line.invoice.status,
      })),
    ]
      .sort(
        (a, b) =>
          b.invoice_date.localeCompare(a.invoice_date) || b.line_id - a.line_id,
      )
      .slice(0, TRADE_ROWS);

    const total = (aggregate: {
      _count: number;
      _sum: {
        quantity: Prisma.Decimal | null;
        totalPrice: Prisma.Decimal | null;
      };
    }) => ({
      lines: aggregate._count,
      quantity: aggregate._sum.quantity?.toNumber() ?? 0,
      amount: aggregate._sum.totalPrice?.toNumber() ?? 0,
    });

    const totals = {
      purchase: total(purchaseTotals),
      sale: total(saleTotals),
      repair: total(repairTotals),
    };

    res.json({
      rows,
      totals,
      // More lines exist than were sent; the page says so rather than
      // letting a short list pass for the whole history.
      truncated:
        purchases.length + sales.length + repairs.length > rows.length ||
        [purchases, sales, repairs].some((list) => list.length === TRADE_ROWS),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

/**
 * The number a ledger row's document is known by, per reference type. The
 * ledger's reference is polymorphic and carries no foreign key, so each
 * kind is looked up in its own table — one query per kind on the page.
 */
async function documentNumbers(
  workspaceId: number,
  rows: { referenceType: string | null; referenceId: number | null }[],
): Promise<Map<string, string>> {
  const idsOf = (type: string) => [
    ...new Set(
      rows
        .filter((row) => row.referenceType === type && row.referenceId)
        .map((row) => row.referenceId as number),
    ),
  ];
  const where = (ids: number[]) => ({ id: { in: ids }, workspaceId });

  const [purchases, sales, repairs, adjustments, counts, transfers] =
    await Promise.all([
      prisma.purchaseInvoice.findMany({
        where: where(idsOf("purchase_invoice")),
        select: { id: true, invoiceNumber: true },
      }),
      prisma.saleInvoice.findMany({
        where: where(idsOf("sale_invoice")),
        select: { id: true, invoiceNumber: true },
      }),
      prisma.repairInvoice.findMany({
        where: where(idsOf("repair_invoice")),
        select: { id: true, invoiceNumber: true },
      }),
      prisma.stockAdjustment.findMany({
        where: where(idsOf("stock_adjustment")),
        select: { id: true, number: true },
      }),
      prisma.stockCount.findMany({
        where: where(idsOf("stock_count")),
        select: { id: true, number: true },
      }),
      prisma.stockTransfer.findMany({
        where: where(idsOf("stock_transfer")),
        select: { id: true, number: true },
      }),
    ]);

  const numbers = new Map<string, string>();
  for (const row of purchases)
    numbers.set(`purchase_invoice:${row.id}`, row.invoiceNumber);
  for (const row of sales)
    numbers.set(`sale_invoice:${row.id}`, row.invoiceNumber);
  for (const row of repairs)
    numbers.set(`repair_invoice:${row.id}`, row.invoiceNumber);
  for (const row of adjustments)
    numbers.set(`stock_adjustment:${row.id}`, row.number);
  for (const row of counts) numbers.set(`stock_count:${row.id}`, row.number);
  for (const row of transfers)
    numbers.set(`stock_transfer:${row.id}`, row.number);
  return numbers;
}

// GET /api/items/:id/kardex
//
// The kardex (14.19): one item's movements in the order they were entered,
// each with its document's date beside it, what came in, what went out and
// the balance after it — the item's total, or one warehouse's when the
// kardex is filtered to one.
//
// The balance is a running sum over the whole ledger in entry order, worked
// out before any date filter is applied, so it is always the true balance
// after that row: a date range chooses which rows are shown, not what they
// add up to. At this scale (hundreds of movements per item) summing in
// JavaScript is cheaper than a window query and needs no raw SQL.
export const getKardex = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const query = valid.query as ItemKardexQuery;
    const workspaceId = workspaceIdOf(req);

    const item = await prisma.item.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!item) {
      return res.status(404).json({ error: "کالا یافت نشد" });
    }

    const ledger = await prisma.inventoryTransaction.findMany({
      where: {
        workspaceId,
        itemId: id,
        ...(query.warehouse_id !== undefined
          ? { warehouseId: query.warehouse_id }
          : {}),
      },
      orderBy: { id: "asc" },
      include: {
        warehouse: { select: { name: true } },
        author: { select: { fullName: true, username: true } },
      },
    });

    // Decimal all the way: a float running sum of 0.1-metre movements
    // drifts, and a kardex whose last balance disagrees with the shelf by
    // 0.0000001 is a kardex nobody trusts.
    let running = new Prisma.Decimal(0);
    const withBalance = ledger.map((row) => {
      running = running.plus(row.quantity);
      return { row, balance: running };
    });

    const range = dateFilter(query.from_date, query.to_date);
    const inRange = range
      ? withBalance.filter(
          ({ row }) =>
            (!range.gte || row.occurredAt >= range.gte) &&
            (!range.lte || row.occurredAt <= range.lte),
        )
      : withBalance;

    let totalIn = new Prisma.Decimal(0);
    let totalOut = new Prisma.Decimal(0);
    for (const { row } of inRange) {
      if (row.quantity.isPositive()) totalIn = totalIn.plus(row.quantity);
      else totalOut = totalOut.minus(row.quantity);
    }
    const first = inRange[0];
    const last = inRange[inRange.length - 1];

    // Newest first on screen; the balances were fixed in entry order above.
    const { page, limit } = query;
    const pageRows = inRange
      .slice()
      .reverse()
      .slice((page - 1) * limit, page * limit);
    const numbers = await documentNumbers(
      workspaceId,
      pageRows.map(({ row }) => row),
    );

    res.json({
      data: pageRows.map(({ row, balance }) => ({
        id: row.id,
        type: row.type,
        reason: row.reason,
        occurred_at: row.occurredAt.toISOString(),
        created_at: row.createdAt.toISOString(),
        warehouse_id: row.warehouseId,
        warehouse_name: row.warehouse.name,
        quantity: row.quantity.toNumber(),
        unit_cost: row.unitCost?.toNumber() ?? null,
        unit_price: row.unitPrice.toNumber(),
        balance: balance.toNumber(),
        reference_type: row.referenceType,
        reference_id: row.referenceId,
        document_number:
          row.referenceType && row.referenceId
            ? (numbers.get(`${row.referenceType}:${row.referenceId}`) ?? null)
            : null,
        note: row.note,
        created_by_name:
          row.author?.fullName?.trim() || row.author?.username || null,
      })),
      summary: {
        // The balance just before the first row shown, and after the last.
        opening: first ? first.balance.minus(first.row.quantity).toNumber() : 0,
        total_in: totalIn.toNumber(),
        total_out: totalOut.toNumber(),
        closing: last ? last.balance.toNumber() : running.toNumber(),
      },
      total: inRange.length,
      page,
      limit,
      totalPages: Math.ceil(inRange.length / limit),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

/** How many past purchases the prices tab lists. */
const PRICE_HISTORY = 20;

// GET /api/items/:id/prices
//
// The item page's «قیمت‌ها» tab (14.20): what the shop has paid for it —
// the last, lowest and highest purchase price, each with the invoice it
// came from, and the average — next to what the stock on hand costs now
// (the moving average) and what it sells for.
//
// The purchase average is weighted by quantity — total paid over units
// bought — so ten units at one price and one at another average as eleven
// units do, not as two invoices. It is a different figure from the moving
// average on the item, which is the cost of what is still on the shelf.
export const getPrices = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;
    const workspaceId = workspaceIdOf(req);

    const item = await prisma.item.findFirst({
      where: { id, workspaceId },
      select: { avgPurchasePrice: true, sellPrice: true },
    });
    if (!item) {
      return res.status(404).json({ error: "کالا یافت نشد" });
    }

    const where = { itemId: id, workspaceId };
    const invoice = {
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        supplierName: true,
      },
    };
    const byDate = [
      { invoice: { invoiceDate: "desc" as const } },
      { id: "desc" as const },
    ];

    const [totals, lowest, highest, history, saleTotals, lastSale] =
      await Promise.all([
        prisma.purchaseInvoiceItem.aggregate({
          where,
          _count: true,
          _sum: { quantity: true, totalPrice: true },
        }),
        prisma.purchaseInvoiceItem.findFirst({
          where,
          orderBy: [{ unitPrice: "asc" }, ...byDate],
          include: { invoice },
        }),
        prisma.purchaseInvoiceItem.findFirst({
          where,
          orderBy: [{ unitPrice: "desc" }, ...byDate],
          include: { invoice },
        }),
        prisma.purchaseInvoiceItem.findMany({
          where,
          orderBy: byDate,
          take: PRICE_HISTORY,
          include: { invoice },
        }),
        prisma.saleInvoiceItem.aggregate({
          where,
          _sum: { quantity: true, totalPrice: true },
        }),
        prisma.saleInvoiceItem.findFirst({
          where,
          orderBy: byDate,
          include: {
            invoice: {
              select: { id: true, invoiceNumber: true, invoiceDate: true },
            },
          },
        }),
      ]);

    type Line = NonNullable<typeof lowest>;
    const point = (line: Line | null) =>
      line
        ? {
            price: line.unitPrice.toNumber(),
            quantity: line.quantity.toNumber(),
            invoice_id: line.invoice.id,
            invoice_number: line.invoice.invoiceNumber,
            invoice_date: line.invoice.invoiceDate.toISOString(),
            supplier: line.invoice.supplierName,
          }
        : null;

    const average = (sum: {
      quantity: Prisma.Decimal | null;
      totalPrice: Prisma.Decimal | null;
    }) =>
      sum.quantity && sum.totalPrice && !sum.quantity.isZero()
        ? Math.round(sum.totalPrice.dividedBy(sum.quantity).toNumber())
        : null;

    res.json({
      purchase: {
        lines: totals._count,
        quantity: totals._sum.quantity?.toNumber() ?? 0,
        last: point(history[0] ?? null),
        lowest: point(lowest),
        highest: point(highest),
        average: average(totals._sum),
      },
      sale: {
        // A line's total is after its discount, so this is what a unit
        // actually sold for on average.
        average: average(saleTotals._sum),
        last: lastSale
          ? {
              price: lastSale.unitPrice.toNumber(),
              invoice_id: lastSale.invoice.id,
              invoice_number: lastSale.invoice.invoiceNumber,
              invoice_date: lastSale.invoice.invoiceDate.toISOString(),
            }
          : null,
      },
      current_average: item.avgPurchasePrice.toNumber(),
      sell_price: item.sellPrice.toNumber(),
      history: history.map((line) => point(line)!),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// POST /api/items
export const create = async (req: Request, res: Response) => {
  try {
    const body = (req as ValidatedRequest).valid.body as ItemCreateBody;
    const actorId = (req as AuthenticatedRequest).user?.id ?? null;
    const workspaceId = workspaceIdOf(req);

    // One request and one transaction for the item and what it opens with.
    // The form used to create the item and then send a second request for
    // its stock, as a zero-priced purchase: that dragged the average cost
    // towards nothing, burned a PUR- number on a 0-rial invoice, and when the
    // second request failed the item was left with no stock and nothing said.
    const item = await runInWorkspaceTransaction(workspaceId, async (tx) => {
      const created = await tx.item.create({
        data: {
          workspaceId,
          code: body.code,
          name: body.name,
          unit: body.unit,
          categoryId: body.categoryId ?? null,
          minStock: body.minStock,
          description: body.description,
          sellPrice: body.sell_price,
          isFractional: body.isFractional,
        },
        select: { id: true },
      });

      if (body.openingStock > 0) {
        await applyStockMovements(
          tx,
          workspaceId,
          { referenceType: null, referenceId: null, actorId },
          [
            {
              itemId: created.id,
              warehouseId: await resolveWarehouseId(
                tx,
                workspaceId,
                body.warehouseId,
              ),
              quantity: body.openingStock,
              type: "opening",
              // Required by the schema whenever there is opening stock:
              // valued at what it actually cost, it is the first point the
              // moving average stands on.
              unitCost: body.openingCost!,
              note: "موجودی اولیه",
            },
          ],
        );
      }

      return tx.item.findFirstOrThrow({
        where: { id: created.id, workspaceId },
        include: itemInclude,
      });
    });

    res.status(201).json(toItemResponse(item));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(400).json(DUPLICATE_CODE);
    }
    if (error instanceof StockError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: errorMessage(error) });
  }
};

// PUT /api/items/:id
//
// Every field the create form takes, the opening balance included.
export const update = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const body = valid.body as ItemUpdateBody;
    const actorId = (req as AuthenticatedRequest).user?.id ?? null;
    const workspaceId = workspaceIdOf(req);

    const data: Prisma.ItemUpdateInput = {};
    if (body.code !== undefined) data.code = body.code;
    if (body.name !== undefined) data.name = body.name;
    if (body.unit !== undefined) data.unit = body.unit;
    if (body.minStock !== undefined) data.minStock = body.minStock;
    if (body.description !== undefined) data.description = body.description;
    if (body.sell_price !== undefined) data.sellPrice = body.sell_price;
    if (body.isFractional !== undefined) data.isFractional = body.isFractional;
    if (body.categoryId !== undefined) {
      data.category =
        body.categoryId === null
          ? { disconnect: true }
          : { connect: { id: body.categoryId } };
    }

    // One transaction: a correction the stock refuses must not leave the
    // name and price saved without it, as if the edit had half worked.
    const item = await runInWorkspaceTransaction(workspaceId, async (tx) => {
      const existing = await tx.item.findFirst({
        where: { id, workspaceId },
        select: { id: true, name: true, createdAt: true },
      });
      if (!existing) throw new ItemNotFound();

      // The fields first, so a correction is checked against the item as it
      // is about to be — 2.5 metres of opening stock on an item being made
      // fractional in the same save.
      if (Object.keys(data).length > 0) {
        await tx.item.update({ where: { id }, data });
      }

      if (body.openingStock !== undefined) {
        await correctOpening(
          tx,
          workspaceId,
          { ...existing, name: body.name ?? existing.name },
          actorId,
          {
            quantity: body.openingStock,
            unitCost: body.openingCost,
            warehouseId: body.warehouseId,
          },
        );
      }

      const saved = await tx.item.findFirstOrThrow({
        where: { id, workspaceId },
        include: itemInclude,
      });

      // Checked against the stock after any correction. An item can stop
      // being fractional only while what it holds is whole: 2.5 metres of a
      // "whole-number" item could never be moved again.
      if (
        body.isFractional === false &&
        !Number.isInteger(saved.currentStock.toNumber())
      ) {
        throw new StockError(
          "موجودی این کالا کسری است؛ تا وقتی موجودی عدد صحیح نشده، نمی‌توان آن را غیرکسری کرد",
        );
      }

      return saved;
    });

    res.json(toItemResponse(item));
  } catch (error) {
    if (error instanceof ItemNotFound) {
      return res.status(404).json({ error: "کالا یافت نشد" });
    }
    if (isUniqueConstraintError(error)) {
      return res.status(400).json(DUPLICATE_CODE);
    }
    if (error instanceof StockError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: errorMessage(error) });
  }
};

class ItemInUse extends Error {}

/**
 * Where an item is still named, in words a shop reads — or null when it is
 * named nowhere and may go.
 *
 * Its own opening balance does not count, nor any correction of it: those
 * rows belong to the item and leave with it. What keeps it is a document —
 * an invoice of any kind, a پیش‌فاکتور included, or a stock document — since
 * each of those is a record the shop keeps, and would be left naming an item
 * that no longer exists. Anything else on the ledger is the last check: a
 * movement with no document behind it is still a movement.
 */
async function whereItemIsUsed(
  tx: Prisma.TransactionClient,
  workspaceId: number,
  itemId: number,
): Promise<string | null> {
  const where = { workspaceId, itemId };
  const distinctCount = async (rows: Promise<unknown[]>): Promise<number> =>
    (await rows).length;

  const counts: [number, string][] = [
    [
      await distinctCount(
        tx.purchaseInvoiceItem.findMany({
          where,
          distinct: ["invoiceId"],
          select: { invoiceId: true },
        }),
      ),
      "فاکتور خرید",
    ],
    [
      await distinctCount(
        tx.saleInvoiceItem.findMany({
          where,
          distinct: ["invoiceId"],
          select: { invoiceId: true },
        }),
      ),
      "فاکتور فروش",
    ],
    [
      // Not a relation — a repair line's item_id may name a service — so a
      // پیش‌فاکتور, which has moved no stock yet, would otherwise be left
      // pointing at nothing and fail on the day it is issued.
      await distinctCount(
        tx.repairInvoiceItem.findMany({
          where: { ...where, itemType: "inventory" },
          distinct: ["invoiceId"],
          select: { invoiceId: true },
        }),
      ),
      "فاکتور تعمیر",
    ],
    [
      await distinctCount(
        tx.stockAdjustmentLine.findMany({
          where,
          distinct: ["adjustmentId"],
          select: { adjustmentId: true },
        }),
      ),
      "سند اصلاح موجودی",
    ],
    [
      await distinctCount(
        tx.stockCountLine.findMany({
          where,
          distinct: ["countId"],
          select: { countId: true },
        }),
      ),
      "انبارگردانی",
    ],
    [
      await distinctCount(
        tx.stockTransferLine.findMany({
          where,
          distinct: ["transferId"],
          select: { transferId: true },
        }),
      ),
      "سند انتقال",
    ],
  ];

  const used = counts
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${toPersianDigits(count)} ${label}`);

  if (used.length > 0) {
    const list =
      used.length === 1
        ? used[0]
        : `${used.slice(0, -1).join("، ")} و ${used[used.length - 1]}`;
    return (
      `این کالا در ${list} ثبت شده و قابل حذف نیست؛ ` +
      "آن سندها سابقه‌ی کارگاه‌اند و باید همچنان نام این کالا را نشان دهند."
    );
  }

  const otherMovements = await tx.inventoryTransaction.count({
    where: {
      ...where,
      NOT: {
        OR: [
          { type: "opening" },
          { type: "reversal", referenceType: OPENING_REFERENCE },
        ],
      },
    },
  });
  if (otherMovements > 0) {
    return "این کالا در کاردکس گردش ثبت‌شده دارد و قابل حذف نیست.";
  }

  return null;
}

// DELETE /api/items/:id
//
// Allowed for an item no document names — typically one entered by mistake,
// opening stock and all. Its stock rows and its own ledger rows go with it.
export const remove = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;
    const workspaceId = workspaceIdOf(req);

    await runInWorkspaceTransaction(workspaceId, async (tx) => {
      // Locked, as the stock service locks it: a sale of this item arriving
      // while it is being checked waits for the answer instead of slipping in
      // between the check and the delete.
      const locked = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM items
        WHERE id = ${id} AND workspace_id = ${workspaceId}
        FOR UPDATE`;
      if (locked.length === 0) throw new ItemNotFound();

      const reason = await whereItemIsUsed(tx, workspaceId, id);
      if (reason) throw new ItemInUse(reason);

      // item_stocks and inventory_transactions follow through ON DELETE
      // CASCADE, which Postgres runs as the tables' owner — the ledger stays
      // append-only for dofixo_app, and still cannot outlive its item.
      await tx.item.delete({ where: { id } });
    });

    res.json({ message: "کالا با موفقیت حذف شد" });
  } catch (error) {
    if (error instanceof ItemNotFound) {
      return res.status(404).json({ error: "کالا یافت نشد" });
    }
    if (error instanceof ItemInUse) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: errorMessage(error) });
  }
};

class ItemNotFound extends Error {}

/** Whether the item exists in this workspace — read inside the
 * transaction, so a quick purchase or sale cannot be lent another
 * workspace's item, and the figures it then acts on are the locked ones. */
async function assertItem(
  tx: Prisma.TransactionClient,
  id: number,
  workspaceId: number,
) {
  const item = await tx.item.findFirst({
    where: { id, workspaceId },
    select: { id: true, sellPrice: true, avgPurchasePrice: true },
  });
  if (!item) throw new ItemNotFound();
  return item;
}

// POST /api/items/:id/quick-purchase
export const quickPurchase = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const body = valid.body as QuickPurchaseBody;
    const actorId = (req as AuthenticatedRequest).user?.id ?? null;
    // Read once, outside the transaction, and passed to every write inside
    // it: the request isn't available in there.
    const workspaceId = workspaceIdOf(req);

    const totalAmount = lineTotals(body).totalPrice;

    // A quick purchase is a one-line purchase invoice, and goes through the
    // same service a purchase invoice does — the item's stock, average and
    // ledger move together, under the same lock, or not at all.
    const result = await runInWorkspaceTransaction(workspaceId, async (tx) => {
      await assertItem(tx, id, workspaceId);
      const warehouseId = await resolveWarehouseId(
        tx,
        workspaceId,
        body.warehouse_id,
      );

      const number = await nextInvoiceNumber(tx, workspaceId, "purchase");
      const invoice = await tx.purchaseInvoice.create({
        data: {
          workspaceId,
          warehouseId,
          invoiceNumber: number,
          supplierName: "خرید سریع",
          totalAmount,
          paidAmount: totalAmount,
          paymentStatus: "paid",
          note: body.note ?? "خرید سریع از صفحه جزئیات کالا",
          createdBy: actorId,
        },
      });

      await tx.purchaseInvoiceItem.create({
        data: {
          workspaceId,
          invoiceId: invoice.id,
          itemId: id,
          quantity: body.quantity,
          unitPrice: body.unit_price,
          totalPrice: totalAmount,
        },
      });

      await applyStockMovements(
        tx,
        workspaceId,
        {
          referenceType: "purchase_invoice",
          referenceId: invoice.id,
          actorId,
        },
        [
          {
            itemId: id,
            warehouseId,
            quantity: body.quantity,
            type: "purchase",
            unitCost: body.unit_price,
            unitPrice: body.unit_price,
            note: "خرید سریع",
          },
        ],
      );

      const item = await tx.item.findFirstOrThrow({
        where: { id, workspaceId },
        select: { currentStock: true },
      });

      return { number, newStock: item.currentStock };
    });

    res.json({
      message: "خرید سریع با موفقیت ثبت شد",
      invoice_number: result.number,
      new_stock: result.newStock.toNumber(),
    });
  } catch (error) {
    if (error instanceof ItemNotFound) {
      return res.status(404).json({ error: "کالا یافت نشد" });
    }
    if (error instanceof StockError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: errorMessage(error) });
  }
};

// POST /api/items/:id/quick-sale
export const quickSale = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const body = valid.body as QuickSaleBody;
    const actorId = (req as AuthenticatedRequest).user?.id ?? null;
    const workspaceId = workspaceIdOf(req);

    const result = await runInWorkspaceTransaction(workspaceId, async (tx) => {
      const item = await assertItem(tx, id, workspaceId);
      const warehouseId = await resolveWarehouseId(
        tx,
        workspaceId,
        body.warehouse_id,
      );

      // Sells at the item's sale price, falling back to its average cost
      // when none has been set. The old code always sold at cost, which
      // recorded every quick sale at a zero margin.
      const sellPrice = item.sellPrice.toNumber();
      const unitPrice =
        sellPrice > 0 ? sellPrice : item.avgPurchasePrice.toNumber();
      const totalAmount = lineTotals({
        quantity: body.quantity,
        unit_price: unitPrice,
      }).totalPrice;

      const number = await nextInvoiceNumber(tx, workspaceId, "sale");
      const invoice = await tx.saleInvoice.create({
        data: {
          workspaceId,
          warehouseId,
          invoiceNumber: number,
          customerName: body.customer_name ?? "فروش سریع",
          totalAmount,
          paidAmount: totalAmount,
          paymentStatus: "paid",
          note: "فروش سریع از صفحه جزئیات کالا",
          createdBy: actorId,
        },
      });

      const [moved] = await applyStockMovements(
        tx,
        workspaceId,
        { referenceType: "sale_invoice", referenceId: invoice.id, actorId },
        [
          {
            itemId: id,
            warehouseId,
            quantity: -body.quantity,
            type: "sale",
            unitPrice,
            note: "فروش سریع",
          },
        ],
      );

      await tx.saleInvoiceItem.create({
        data: {
          workspaceId,
          invoiceId: invoice.id,
          itemId: id,
          quantity: body.quantity,
          unitPrice,
          totalPrice: totalAmount,
          // The cost it actually left at, under the lock — what the margin
          // on this sale is measured against.
          unitCost: moved.unitCost,
        },
      });

      // The item's total, as quick purchase answers — not this warehouse's.
      const after = await tx.item.findFirstOrThrow({
        where: { id, workspaceId },
        select: { currentStock: true },
      });

      return { number, newStock: after.currentStock };
    });

    res.json({
      message: "فروش سریع با موفقیت ثبت شد",
      invoice_number: result.number,
      new_stock: result.newStock.toNumber(),
    });
  } catch (error) {
    if (error instanceof ItemNotFound) {
      return res.status(404).json({ error: "کالا یافت نشد" });
    }
    if (error instanceof StockError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: errorMessage(error) });
  }
};
