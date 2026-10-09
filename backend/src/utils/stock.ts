import { Prisma } from "../generated/prisma/client";
import { averageAfterAdding, averageAfterRemoving } from "./avgPurchasePrice";

/**
 * The only module that moves stock (roadmap 14.4).
 *
 * Nothing else writes `items.current_stock`, `items.avg_purchase_price`,
 * `item_stocks` or `inventory_transactions`. Invoices, quick purchases and
 * sales, adjustments, counts and transfers all describe *what* moved and
 * hand it here; this module decides whether it may, what it cost, and writes
 * the four tables together.
 *
 * Two halves, for RULES §3:
 *
 *   * planStockMovements — pure. Given the locked state and the lines, it
 *     works out every new figure or refuses. All the arithmetic on stock and
 *     cost is here, where a unit test can reach it.
 *   * applyStockMovements — the I/O. Locks, reads, plans, writes.
 *
 * Why it exists at all: until 14.4 each of four controllers read the stock,
 * did the sum in JavaScript and wrote the result back as an absolute number,
 * with no lock between. Two sales of the last unit both passed the check and
 * one decrement was lost. Here the rows are locked before they are read, so
 * the second caller waits for the first and then sees what it left.
 *
 * ⚠️ The raw statements carry no workspace context of their own (RULES §7).
 * They are safe only because applyStockMovements runs inside
 * runInWorkspaceTransaction(), which sets it as the first statement — and
 * every one of them still names workspace_id, so the policy and the
 * predicate have to agree.
 */

type MovementType = Prisma.InventoryTransactionUncheckedCreateInput["type"];
type MovementReason = NonNullable<
  Prisma.InventoryTransactionUncheckedCreateInput["reason"]
>;

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

/** One movement of one item in one warehouse. */
export interface StockLine {
  itemId: number;
  warehouseId: number;
  /** Signed: positive into the warehouse, negative out of it. */
  quantity: number;
  type: MovementType;
  /**
   * What one unit cost, when the caller knows better than the moving
   * average: the price paid on a purchase or an opening balance, and the
   * original price when a purchase is taken back out. Omitted, the item's
   * current average is used and the average does not move.
   */
  unitCost?: number | null;
  /** The price on the document line, for the kardex. Not a cost. */
  unitPrice?: number | null;
  reason?: MovementReason | null;
  note?: string | null;
}

/** What the lines belong to — one invoice, one count, one transfer. */
export interface StockDocument {
  referenceType: string | null;
  referenceId: number | null;
  /** The document's own date; defaults to now. */
  occurredAt?: Date;
  actorId: number | null;
}

export interface ItemState {
  id: number;
  name: string;
  isFractional: boolean;
  /** The total across every warehouse. */
  stock: Decimal;
  avgCost: number;
}

export interface WarehouseState {
  id: number;
  name: string;
  isActive: boolean;
}

/** One line, worked out. In the order the lines were given. */
export interface PlannedMovement {
  itemId: number;
  warehouseId: number;
  type: MovementType;
  quantity: Decimal;
  /** What one unit cost at this movement — recorded on the ledger row. */
  unitCost: number;
  unitPrice: number;
  reason: MovementReason | null;
  note: string | null;
  /** This warehouse's quantity either side of the movement. */
  before: Decimal;
  after: Decimal;
}

export interface StockPlan {
  movements: PlannedMovement[];
  /** The final total and average of every item touched. */
  items: Map<number, { stock: Decimal; avgCost: number }>;
  /** The final quantity of every (item, warehouse) touched. */
  stocks: Map<string, Decimal>;
}

// ── Refusals ─────────────────────────────────────────────────

/**
 * A movement the stock cannot take. Ordinary outcomes rather than bugs —
 * somebody tried to sell what is not on the shelf — so each carries a
 * message fit to show the person who tried, and controllers answer 400.
 */
export class StockError extends Error {}

export class InsufficientStockError extends StockError {
  constructor(
    readonly itemId: number,
    readonly itemName: string,
    readonly available: number,
    readonly requested: number,
  ) {
    super(
      `موجودی کالای «${itemName}» کافی نیست. موجودی: ${available}، درخواست: ${requested}`,
    );
  }
}

export class FractionalQuantityError extends StockError {
  constructor(readonly itemName: string) {
    super(`کالای «${itemName}» فقط با تعداد صحیح جابه‌جا می‌شود`);
  }
}

export class UnknownItemError extends StockError {
  constructor(readonly itemId: number) {
    super(`کالا با شناسه ${itemId} یافت نشد`);
  }
}

export class UnknownWarehouseError extends StockError {
  constructor(readonly warehouseId: number) {
    super(`انبار با شناسه ${warehouseId} یافت نشد`);
  }
}

export class InactiveWarehouseError extends StockError {
  constructor(readonly warehouseName: string) {
    super(`انبار «${warehouseName}» غیرفعال است`);
  }
}

export class InvalidQuantityError extends StockError {
  constructor(quantity: number) {
    super(
      `مقدار ${quantity} معتبر نیست — باید غیر صفر و حداکثر با سه رقم اعشار باشد`,
    );
  }
}

// ── The arithmetic ───────────────────────────────────────────

export function stockKey(itemId: number, warehouseId: number): string {
  return `${itemId}:${warehouseId}`;
}

/**
 * avg_purchase_price and unit_cost are Decimal(18,2). Applied to what is
 * written, never to what is carried between lines: rounding after every line
 * lets the error build up across a document — an edit that adds four units
 * at 2500 and takes ten at 2000 back out would land on 2500.01 rather than
 * 2500.
 */
function toCostPrecision(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Every figure the lines will produce, or the reason they cannot.
 *
 * Lines are applied in the order given, each seeing what the one before it
 * left — an invoice edit takes its old lines out before it puts the new ones
 * in, and that order is the caller's to choose.
 *
 * Cost:
 *   * Coming in, at `unitCost` when the caller gives one (a purchase, an
 *     opening balance), pulling the average towards it; otherwise at the
 *     current average, which leaves the average where it was.
 *   * Going out, at the current average, which leaves it where it was — the
 *     average is the cost of what is on hand, and selling some of it does
 *     not change what the rest cost. Except when the caller names the cost
 *     the units came in at: a purchase taken back out leaves at its own
 *     price (utils/avgPurchasePrice.ts explains why).
 *
 * The average is per item, across warehouses: a transfer moves stock out
 * of one and into another at the same average, and the item's figure does
 * not change.
 */
export function planStockMovements(
  items: Map<number, ItemState>,
  warehouses: Map<number, WarehouseState>,
  stocks: Map<string, Decimal>,
  lines: StockLine[],
): StockPlan {
  const itemState = new Map(
    [...items].map(([id, item]) => [
      id,
      { stock: item.stock, avgCost: item.avgCost },
    ]),
  );
  const stockState = new Map(stocks);
  const movements: PlannedMovement[] = [];

  for (const line of lines) {
    const item = items.get(line.itemId);
    if (!item) throw new UnknownItemError(line.itemId);

    const warehouse = warehouses.get(line.warehouseId);
    if (!warehouse) throw new UnknownWarehouseError(line.warehouseId);

    // A warehouse is deactivated only once it is empty. What may still
    // reach it is an old document taking back its own movement — an edited
    // or deleted invoice from before — which is not new stock arriving.
    if (!warehouse.isActive && line.type !== "reversal") {
      throw new InactiveWarehouseError(warehouse.name);
    }

    if (
      !Number.isFinite(line.quantity) ||
      line.quantity === 0 ||
      new Decimal(line.quantity).decimalPlaces() > 3
    ) {
      throw new InvalidQuantityError(line.quantity);
    }

    const quantity = new Decimal(line.quantity);

    if (!item.isFractional && !quantity.isInteger()) {
      throw new FractionalQuantityError(item.name);
    }

    const current = itemState.get(line.itemId)!;
    const key = stockKey(line.itemId, line.warehouseId);
    const before = stockState.get(key) ?? new Decimal(0);
    const after = before.plus(quantity);

    if (after.isNegative()) {
      throw new InsufficientStockError(
        item.id,
        item.name,
        before.toNumber(),
        quantity.abs().toNumber(),
      );
    }

    const amount = quantity.abs().toNumber();
    const hasCost = line.unitCost !== undefined && line.unitCost !== null;
    let unitCost: number;
    let avgCost: number;

    if (quantity.isPositive()) {
      unitCost = hasCost ? line.unitCost! : current.avgCost;
      avgCost = hasCost
        ? averageAfterAdding({
            avg: current.avgCost,
            stock: current.stock.toNumber(),
            quantity: amount,
            unitPrice: unitCost,
          })
        : current.avgCost;
    } else {
      unitCost = hasCost ? line.unitCost! : current.avgCost;
      avgCost = hasCost
        ? averageAfterRemoving({
            avg: current.avgCost,
            stock: current.stock.toNumber(),
            quantity: amount,
            unitPrice: unitCost,
          })
        : current.avgCost;
    }

    itemState.set(line.itemId, {
      stock: current.stock.plus(quantity),
      avgCost,
    });
    stockState.set(key, after);

    movements.push({
      itemId: line.itemId,
      warehouseId: line.warehouseId,
      type: line.type,
      quantity,
      unitCost: toCostPrecision(unitCost),
      unitPrice: Math.round(line.unitPrice ?? 0),
      reason: line.reason ?? null,
      note: line.note ?? null,
      before,
      after,
    });
  }

  const touchedItems = new Set(lines.map((line) => line.itemId));
  const touchedStocks = new Set(
    lines.map((line) => stockKey(line.itemId, line.warehouseId)),
  );

  return {
    movements,
    items: new Map(
      [...itemState]
        .filter(([id]) => touchedItems.has(id))
        .map(([id, state]) => [
          id,
          { stock: state.stock, avgCost: toCostPrecision(state.avgCost) },
        ]),
    ),
    stocks: new Map([...stockState].filter(([key]) => touchedStocks.has(key))),
  };
}

// ── The I/O ──────────────────────────────────────────────────

/**
 * A numeric column, whatever the driver hands back. A raw query skips
 * Prisma's result mapping, and `numeric` can arrive as a string or a
 * Decimal depending on the driver.
 */
function toDecimal(value: unknown): Decimal {
  return new Decimal(String(value));
}

/**
 * Moves the stock for one document, inside the caller's transaction.
 *
 * Locks before it reads: every item touched, then every (item, warehouse)
 * row touched, each in ascending order. Two documents touching the same
 * items in a different order therefore queue rather than deadlock, and a
 * second sale of the last unit waits for the first and then finds nothing
 * left.
 *
 * Throws a StockError when the lines cannot be applied — the transaction
 * rolls back with it, so nothing the caller wrote before the call survives
 * either. That is the point of taking the caller's `tx`.
 */
export async function applyStockMovements(
  tx: Prisma.TransactionClient,
  workspaceId: number,
  document: StockDocument,
  lines: StockLine[],
): Promise<PlannedMovement[]> {
  if (lines.length === 0) return [];

  const itemIds = [...new Set(lines.map((line) => line.itemId))].sort(
    (a, b) => a - b,
  );
  const warehouseIds = [...new Set(lines.map((line) => line.warehouseId))];

  const itemRows = await tx.$queryRaw<
    {
      id: number;
      name: string;
      current_stock: unknown;
      avg_purchase_price: unknown;
      is_fractional: boolean;
    }[]
  >`
    SELECT id, name, current_stock, avg_purchase_price, is_fractional
    FROM items
    WHERE workspace_id = ${workspaceId} AND id = ANY(${itemIds}::int[])
    ORDER BY id
    FOR UPDATE
  `;

  const items = new Map<number, ItemState>(
    itemRows.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        isFractional: row.is_fractional,
        stock: toDecimal(row.current_stock),
        avgCost: toDecimal(row.avg_purchase_price).toNumber(),
      },
    ]),
  );

  // Not locked: a warehouse's own row never changes with stock, and one is
  // only deactivated once it holds nothing.
  const warehouseRows = await tx.warehouse.findMany({
    where: { workspaceId, id: { in: warehouseIds } },
    select: { id: true, name: true, isActive: true },
  });
  const warehouses = new Map(warehouseRows.map((row) => [row.id, row]));

  // Unknown ids fail here, before the INSERT below could turn them into a
  // foreign key error with no explanation in it.
  for (const line of lines) {
    if (!items.has(line.itemId)) throw new UnknownItemError(line.itemId);
    if (!warehouses.has(line.warehouseId)) {
      throw new UnknownWarehouseError(line.warehouseId);
    }
  }

  const pairs = [
    ...new Map(
      lines.map((line) => [
        stockKey(line.itemId, line.warehouseId),
        [line.itemId, line.warehouseId] as const,
      ]),
    ).values(),
  ].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const pairItems = pairs.map((pair) => pair[0]);
  const pairWarehouses = pairs.map((pair) => pair[1]);

  // The first movement of an item into a warehouse has no row to lock yet.
  await tx.$executeRaw`
    INSERT INTO item_stocks (workspace_id, item_id, warehouse_id, quantity, created_at, updated_at)
    SELECT ${workspaceId}, t.item_id, t.warehouse_id, 0, now(), now()
    FROM unnest(${pairItems}::int[], ${pairWarehouses}::int[]) AS t(item_id, warehouse_id)
    ON CONFLICT (item_id, warehouse_id) DO NOTHING
  `;

  const stockRows = await tx.$queryRaw<
    { item_id: number; warehouse_id: number; quantity: unknown }[]
  >`
    SELECT s.item_id, s.warehouse_id, s.quantity
    FROM item_stocks s
    JOIN unnest(${pairItems}::int[], ${pairWarehouses}::int[]) AS t(item_id, warehouse_id)
      ON t.item_id = s.item_id AND t.warehouse_id = s.warehouse_id
    WHERE s.workspace_id = ${workspaceId}
    ORDER BY s.item_id, s.warehouse_id
    FOR UPDATE OF s
  `;

  const stocks = new Map(
    stockRows.map((row) => [
      stockKey(row.item_id, row.warehouse_id),
      toDecimal(row.quantity),
    ]),
  );

  const plan = planStockMovements(items, warehouses, stocks, lines);

  for (const [itemId, state] of plan.items) {
    await tx.item.updateMany({
      where: { id: itemId, workspaceId },
      data: { currentStock: state.stock, avgPurchasePrice: state.avgCost },
    });
  }

  for (const [key, quantity] of plan.stocks) {
    const [itemId, warehouseId] = key.split(":").map(Number);
    await tx.itemStock.updateMany({
      where: { itemId, warehouseId, workspaceId },
      data: { quantity },
    });
  }

  const occurredAt = document.occurredAt ?? new Date();

  await tx.inventoryTransaction.createMany({
    data: plan.movements.map((movement) => ({
      workspaceId,
      itemId: movement.itemId,
      warehouseId: movement.warehouseId,
      type: movement.type,
      quantity: movement.quantity,
      unitPrice: movement.unitPrice,
      unitCost: movement.unitCost,
      beforeQuantity: movement.before,
      afterQuantity: movement.after,
      reason: movement.reason,
      referenceId: document.referenceId,
      referenceType: document.referenceType,
      note: movement.note,
      occurredAt,
      createdBy: document.actorId,
    })),
  });

  return plan.movements;
}
