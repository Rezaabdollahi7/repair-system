import { Request, Response } from "express";
import prisma from "../lib/prisma";
import type { Prisma } from "../generated/prisma/client";
import { ValidatedRequest } from "../middleware/validate";
import {
  dateFilter,
  endOfDay,
  lastDaysRange,
  monthRange,
  todayRange,
  utcDayKey,
} from "../utils/dateRange";
import { errorMessage } from "../utils/errors";
import type {
  DateRangeQuery,
  MovementReportQuery,
  StockReportQuery,
} from "../schemas/report";
import { workspaceIdOf } from "../utils/workspace";

type StockStatus = "critical" | "low" | "good";

function stockStatus(currentStock: number, minStock: number): StockStatus {
  if (currentStock === 0) return "critical";
  if (currentStock <= minStock) return "low";
  return "good";
}

// A quantity has three decimal places and a cost two (14.1). Sums of
// products in floating point land a hair off — 0.4 × 30,000 is
// 12,000.000000000002 — so each figure is rounded once, on the way out.
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// GET /api/reports/stock
//
// With `warehouseId`, the report answers «what is in this warehouse and what
// is it worth»: only items holding stock there, valued at that quantity, and
// `warehouse_stock` beside the total. The status still compares the item's
// total with its minimum, because the minimum is set per item across every
// warehouse (14 decisions) — an item that lives in the main warehouse is not
// «critical» for having none in the repairs one.
export const getStockReport = async (req: Request, res: Response) => {
  try {
    const query = (req as ValidatedRequest).valid.query as StockReportQuery;
    const workspaceId = workspaceIdOf(req);
    const warehouseId = query.warehouseId;

    if (warehouseId !== undefined) {
      const warehouse = await prisma.warehouse.findFirst({
        where: { id: warehouseId, workspaceId },
        select: { id: true },
      });
      if (!warehouse) {
        return res.status(404).json({ error: "انبار یافت نشد" });
      }
    }

    const where: Prisma.ItemWhereInput = {
      isActive: true,
      workspaceId,
    };
    if (query.categoryId !== undefined) {
      where.categoryId = query.categoryId;
    }
    if (warehouseId !== undefined) {
      where.stocks = { some: { warehouseId, quantity: { gt: 0 } } };
    }

    const items = await prisma.item.findMany({
      where,
      orderBy: [{ currentStock: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        currentStock: true,
        minStock: true,
        avgPurchasePrice: true,
        category: { select: { name: true } },
        ...(warehouseId !== undefined
          ? {
              stocks: {
                where: { warehouseId },
                select: { quantity: true },
              },
            }
          : {}),
      },
    });

    // Both the status and the low-stock filter compare two columns against
    // each other, which Prisma can't express in where or orderBy.
    const rows = items.map((item) => {
      const currentStock = item.currentStock.toNumber();
      const minStock = item.minStock.toNumber();
      const stocks = (item as { stocks?: { quantity: Prisma.Decimal }[] })
        .stocks;
      return {
        id: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit,
        current_stock: currentStock,
        warehouse_stock:
          warehouseId !== undefined
            ? (stocks?.[0]?.quantity.toNumber() ?? 0)
            : null,
        min_stock: minStock,
        avg_purchase_price: item.avgPurchasePrice.toNumber(),
        category_name: item.category?.name ?? null,
        stock_status: stockStatus(currentStock, minStock),
      };
    });

    // Within one warehouse the shortest shelf comes first, as the total does
    // without a filter. Array.sort is stable, so the name order the query
    // returned survives among equal quantities.
    if (warehouseId !== undefined) {
      rows.sort((a, b) => (a.warehouse_stock ?? 0) - (b.warehouse_stock ?? 0));
    }

    const data =
      query.lowStockOnly === "true"
        ? rows.filter((row) => row.current_stock <= row.min_stock)
        : rows;

    res.json({
      data,
      summary: {
        total_items: data.length,
        low_stock_count: data.filter((row) => row.stock_status === "low")
          .length,
        critical_count: data.filter((row) => row.stock_status === "critical")
          .length,
        total_inventory_value: roundMoney(
          data.reduce(
            (sum, row) =>
              sum +
              (row.warehouse_stock ?? row.current_stock) *
                row.avg_purchase_price,
            0,
          ),
        ),
      },
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/reports/purchases
export const getPurchaseReport = async (req: Request, res: Response) => {
  try {
    const { from_date, to_date } = (req as ValidatedRequest).valid
      .query as DateRangeQuery;

    const invoiceDate = dateFilter(from_date, to_date);

    const invoices = await prisma.purchaseInvoice.findMany({
      where: {
        workspaceId: workspaceIdOf(req),
        ...(invoiceDate ? { invoiceDate } : {}),
      },
      orderBy: { invoiceDate: "desc" },
      include: { items: { select: { quantity: true } } },
    });

    const data = invoices.map((invoice) => ({
      id: invoice.id,
      invoice_number: invoice.invoiceNumber,
      supplier_name: invoice.supplierName,
      invoice_date: invoice.invoiceDate.toISOString(),
      total_amount: invoice.totalAmount.toNumber(),
      paid_amount: invoice.paidAmount.toNumber(),
      payment_status: invoice.paymentStatus,
      item_count: invoice.items.length,
      total_quantity: invoice.items.reduce(
        (sum, line) => sum + line.quantity.toNumber(),
        0,
      ),
    }));

    const totalPurchase = data.reduce((sum, row) => sum + row.total_amount, 0);
    const totalPaid = data.reduce((sum, row) => sum + row.paid_amount, 0);

    res.json({
      data,
      summary: {
        total_invoices: data.length,
        total_purchase_amount: totalPurchase,
        total_paid_amount: totalPaid,
        total_remaining: totalPurchase - totalPaid,
      },
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/reports/sales
export const getSaleReport = async (req: Request, res: Response) => {
  try {
    const { from_date, to_date } = (req as ValidatedRequest).valid
      .query as DateRangeQuery;

    const invoiceDate = dateFilter(from_date, to_date);

    const invoices = await prisma.saleInvoice.findMany({
      where: {
        workspaceId: workspaceIdOf(req),
        ...(invoiceDate ? { invoiceDate } : {}),
      },
      orderBy: { invoiceDate: "desc" },
      include: { items: { select: { quantity: true } } },
    });

    const data = invoices.map((invoice) => ({
      id: invoice.id,
      invoice_number: invoice.invoiceNumber,
      customer_name: invoice.customerName,
      customer_phone: invoice.customerPhone,
      invoice_date: invoice.invoiceDate.toISOString(),
      total_amount: invoice.totalAmount.toNumber(),
      paid_amount: invoice.paidAmount.toNumber(),
      payment_status: invoice.paymentStatus,
      item_count: invoice.items.length,
      total_quantity: invoice.items.reduce(
        (sum, line) => sum + line.quantity.toNumber(),
        0,
      ),
    }));

    const totalSales = data.reduce((sum, row) => sum + row.total_amount, 0);
    const totalReceived = data.reduce((sum, row) => sum + row.paid_amount, 0);

    res.json({
      data,
      summary: {
        total_invoices: data.length,
        total_sales_amount: totalSales,
        total_received_amount: totalReceived,
        total_remaining: totalSales - totalReceived,
      },
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/reports/profit
//
// Each line is costed at the `unit_cost` it stored when it left the shelf
// (14.6) — the item's average at that moment — so a margin reported today is
// the margin that sale made, and restocking at a new price no longer rewrites
// last month. Lines written before 14.6 carry no cost; they fall back to the
// item's current average, which is all the old report ever had. Production
// had no invoices when 14.1 shipped, so that fallback only ever meets
// development and demo data.
export const getProfitReport = async (req: Request, res: Response) => {
  try {
    const { from_date, to_date } = (req as ValidatedRequest).valid
      .query as DateRangeQuery;

    const invoiceDate = dateFilter(from_date, to_date);
    const workspaceId = workspaceIdOf(req);

    // Lines rather than a groupBy: the cost is quantity × unit_cost per line,
    // a product groupBy cannot sum. A period of one shop's sales is hundreds
    // of rows, and [workspaceId, invoiceDate] is indexed.
    //
    // Custom sale lines carry no item_id and so no known cost — the old
    // query's inner join excluded them, and they stay excluded here.
    const lines = await prisma.saleInvoiceItem.findMany({
      where: {
        workspaceId,
        itemId: { not: null },
        ...(invoiceDate ? { invoice: { invoiceDate } } : {}),
      },
      select: {
        itemId: true,
        quantity: true,
        totalPrice: true,
        unitCost: true,
        item: {
          select: { name: true, code: true, avgPurchasePrice: true },
        },
      },
    });

    const byItem = new Map<
      number,
      {
        name: string | null;
        code: string | null;
        quantity: number;
        revenue: number;
        cost: number;
      }
    >();

    for (const line of lines) {
      const itemId = line.itemId as number;
      const quantity = line.quantity.toNumber();
      const unitCost =
        line.unitCost?.toNumber() ??
        line.item?.avgPurchasePrice.toNumber() ??
        0;

      const row = byItem.get(itemId) ?? {
        name: line.item?.name ?? null,
        code: line.item?.code ?? null,
        quantity: 0,
        revenue: 0,
        cost: 0,
      };
      row.quantity += quantity;
      row.revenue += line.totalPrice.toNumber();
      row.cost += quantity * unitCost;
      byItem.set(itemId, row);
    }

    const data = [...byItem.entries()]
      .map(([itemId, row]) => {
        const quantity = roundQuantity(row.quantity);
        const revenue = row.revenue;
        const cost = roundMoney(row.cost);
        const profit = roundMoney(revenue - cost);

        return {
          item_id: itemId,
          item_name: row.name,
          item_code: row.code,
          total_quantity: quantity,
          total_revenue: revenue,
          total_cost: cost,
          profit,
          profit_margin: revenue > 0 ? (profit / revenue) * 100 : 0,
        };
      })
      .sort((a, b) => b.profit - a.profit);

    const totalRevenue = data.reduce((sum, row) => sum + row.total_revenue, 0);
    const totalCost = roundMoney(
      data.reduce((sum, row) => sum + row.total_cost, 0),
    );
    const totalProfit = roundMoney(totalRevenue - totalCost);

    res.json({
      data,
      summary: {
        total_revenue: totalRevenue,
        total_cost: totalCost,
        total_profit: totalProfit,
        profit_margin:
          totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
      },
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/reports/dashboard
/**
 * The columns of the movement report (14.21), and which ledger types feed
 * each. In and out are kept apart rather than netted — a shop wants to see
 * that ten came in and eight went out, not that two did. Stock entered with
 * the item has its own column: for a shop that has just set up, it is most
 * of what it holds. The two signed columns are corrections (adjustment,
 * count) and the rest (a document taking itself back, returns), which can
 * go either way.
 */
const MOVEMENT_COLUMNS = {
  initial: ["opening"],
  purchase: ["purchase"],
  sale: ["sale"],
  repair_use: ["repair_use"],
  transfer_in: ["transfer_in"],
  transfer_out: ["transfer_out"],
  correction: ["adjustment", "count"],
  other: ["reversal", "purchase_return", "sale_return"],
} as const;

type MovementColumn = keyof typeof MOVEMENT_COLUMNS;

const COLUMN_OF = new Map<string, MovementColumn>(
  (
    Object.entries(MOVEMENT_COLUMNS) as [MovementColumn, readonly string[]][]
  ).flatMap(([column, types]) => types.map((type) => [type, column] as const)),
);

// GET /api/reports/movements
//
// گردش کالا (14.21): for each item, what it held when the period began,
// what moved during it — per kind of movement — and what it held at the
// end. By the document's date (occurred_at), so a purchase entered today
// for last week counts in last week. With a warehouse, every figure is that
// warehouse's; without, the item's total, where a transfer appears on both
// sides and nets to nothing.
//
// Two grouped queries over the ledger and no raw SQL: one for everything
// before the period (the opening balance), one for the period by type.
export const getMovementReport = async (req: Request, res: Response) => {
  try {
    const query = (req as ValidatedRequest).valid.query as MovementReportQuery;
    const workspaceId = workspaceIdOf(req);

    const scope: Prisma.InventoryTransactionWhereInput = {
      workspaceId,
      ...(query.warehouse_id !== undefined
        ? { warehouseId: query.warehouse_id }
        : {}),
      ...(query.category_id !== undefined
        ? { item: { categoryId: query.category_id } }
        : {}),
    };
    const end = query.to_date ? endOfDay(query.to_date) : undefined;

    const [before, during] = await Promise.all([
      query.from_date
        ? prisma.inventoryTransaction.groupBy({
            by: ["itemId"],
            where: { ...scope, occurredAt: { lt: query.from_date } },
            _sum: { quantity: true },
          })
        : Promise.resolve([]),
      prisma.inventoryTransaction.groupBy({
        by: ["itemId", "type"],
        where: {
          ...scope,
          ...(query.from_date || end
            ? {
                occurredAt: {
                  ...(query.from_date ? { gte: query.from_date } : {}),
                  ...(end ? { lte: end } : {}),
                },
              }
            : {}),
        },
        _sum: { quantity: true },
      }),
    ]);

    const opening = new Map<number, number>(
      before.map((row) => [row.itemId, row._sum.quantity?.toNumber() ?? 0]),
    );
    const moved = new Map<number, Record<MovementColumn, number>>();
    for (const row of during) {
      const column = COLUMN_OF.get(row.type) ?? "other";
      const columns =
        moved.get(row.itemId) ??
        ({
          initial: 0,
          purchase: 0,
          sale: 0,
          repair_use: 0,
          transfer_in: 0,
          transfer_out: 0,
          correction: 0,
          other: 0,
        } satisfies Record<MovementColumn, number>);
      columns[column] = roundQuantity(
        columns[column] + (row._sum.quantity?.toNumber() ?? 0),
      );
      moved.set(row.itemId, columns);
    }

    // Items that held something when the period began or moved during it.
    const itemIds = [
      ...new Set([
        ...[...opening]
          .filter(([, quantity]) => quantity !== 0)
          .map(([id]) => id),
        ...moved.keys(),
      ]),
    ];
    const items = itemIds.length
      ? await prisma.item.findMany({
          where: { id: { in: itemIds }, workspaceId },
          select: {
            id: true,
            code: true,
            name: true,
            unit: true,
            category: { select: { name: true } },
          },
          orderBy: { name: "asc" },
        })
      : [];

    const data = items.map((item) => {
      const columns = moved.get(item.id);
      const start = roundQuantity(opening.get(item.id) ?? 0);
      const net = columns
        ? Object.values(columns).reduce((sum, value) => sum + value, 0)
        : 0;
      return {
        item_id: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit,
        category_name: item.category?.name ?? null,
        opening: start,
        // Outgoing columns are reported as positive quantities; the two
        // signed columns keep their sign.
        initial: columns?.initial ?? 0,
        purchase: columns?.purchase ?? 0,
        sale: -(columns?.sale ?? 0) || 0,
        repair_use: -(columns?.repair_use ?? 0) || 0,
        transfer_in: columns?.transfer_in ?? 0,
        transfer_out: -(columns?.transfer_out ?? 0) || 0,
        correction: columns?.correction ?? 0,
        other: columns?.other ?? 0,
        closing: roundQuantity(start + net),
        moved: columns !== undefined,
      };
    });

    res.json({
      data,
      summary: {
        item_count: data.length,
        moved_count: data.filter((row) => row.moved).length,
      },
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const today = todayRange();
    const month = monthRange();
    /*
     * The trend chart's window. Fourteen days rather than thirty: a workshop
     * closes one day a week, and at thirty points those closures crowd into a
     * comb the eye reads as noise instead of a weekly rhythm.
     */
    const TREND_DAYS = 14;
    const trend = lastDaysRange(TREND_DAYS);
    const workspaceId = workspaceIdOf(req);

    const issuedOrPaid: Prisma.RepairInvoiceWhereInput = {
      workspaceId,
      status: { in: ["issued", "paid"] },
    };
    const awaitingPayment: Prisma.RepairInvoiceWhereInput = {
      workspaceId,
      status: "issued",
      paymentStatus: { in: ["pending", "partial"] },
    };

    /*
     * Which devices still have work in them.
     *
     * `IN_PROGRESS` is the set the «در حال تعمیر» figure has always counted,
     * pulled out of its query so the two cannot drift. `OPEN` adds the ones
     * that have arrived and not been looked at yet — a device sitting in
     * `pending` is on somebody's bench even though nobody has touched it,
     * and the workload card would be lying if it left those out.
     *
     * Everything else is finished as far as a technician is concerned:
     * `repaired` and `ready_for_pickup` are waiting on the customer, and
     * `delivered`, `unrepairable` and `not_repaired` are closed.
     *
     * The test is the status rather than `exitDate`. That column exists and
     * would read more naturally, but nothing in the app sets it except a
     * field on the edit form, so a shop that never fills it in would show
     * every device it has ever taken in as open.
     */
    const IN_PROGRESS = ["diagnosing", "repairing", "waiting_for_parts"];
    const OPEN = ["pending", ...IN_PROGRESS];
    const openDevice: Prisma.DeviceWhereInput = {
      workspaceId,
      status: { in: OPEN },
    };

    // Issued in parallel: they're independent reads and the dashboard waits
    // on the slowest, not the sum.
    const [
      todayRepairCount,
      todayRepairRevenue,
      monthRepairRevenue,
      pendingPaymentCount,
      unpaidTotals,
      totalItems,
      items,
      todayPurchase,
      todaySale,
      monthPurchase,
      monthSale,
      recentTransactions,
      topItemsGrouped,
      totalDevices,
      todayDevices,
      repairingDevices,
      devicesByStatus,
      openDevices,
      unassignedDevices,
      openAssignments,
      trendRepairInvoices,
      trendSaleInvoices,
      monthRepairPayments,
    ] = await Promise.all([
      prisma.repairInvoice.count({
        where: { workspaceId, invoiceDate: today },
      }),
      prisma.repairInvoice.aggregate({
        where: { invoiceDate: today, ...issuedOrPaid },
        _sum: { totalAmount: true },
      }),
      prisma.repairInvoice.aggregate({
        where: { invoiceDate: month, ...issuedOrPaid },
        _sum: { totalAmount: true },
      }),
      prisma.repairInvoice.count({ where: awaitingPayment }),
      prisma.repairInvoice.aggregate({
        where: awaitingPayment,
        _sum: { totalAmount: true, paidAmount: true },
      }),
      prisma.item.count({ where: { workspaceId, isActive: true } }),
      prisma.item.findMany({
        where: { workspaceId, isActive: true },
        select: { currentStock: true, minStock: true },
      }),
      prisma.purchaseInvoice.aggregate({
        where: { workspaceId, invoiceDate: today },
        _sum: { totalAmount: true },
      }),
      prisma.saleInvoice.aggregate({
        where: { workspaceId, invoiceDate: today },
        _sum: { totalAmount: true },
      }),
      prisma.purchaseInvoice.aggregate({
        where: { workspaceId, invoiceDate: month },
        _sum: { totalAmount: true },
      }),
      prisma.saleInvoice.aggregate({
        where: { workspaceId, invoiceDate: month },
        _sum: { totalAmount: true },
      }),
      prisma.inventoryTransaction.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { item: { select: { name: true, code: true, unit: true } } },
      }),
      prisma.saleInvoiceItem.groupBy({
        by: ["itemId"],
        where: { workspaceId, itemId: { not: null } },
        _sum: { quantity: true, totalPrice: true },
        orderBy: { _sum: { totalPrice: "desc" } },
        take: 5,
      }),
      prisma.device.count({ where: { workspaceId } }),
      prisma.device.count({ where: { workspaceId, createdAt: today } }),
      prisma.device.count({
        where: { workspaceId, status: { in: IN_PROGRESS } },
      }),
      prisma.device.groupBy({
        by: ["status"],
        where: { workspaceId },
        _count: { status: true },
        orderBy: { _count: { status: "desc" } },
      }),
      prisma.device.count({ where: openDevice }),
      /*
       * Open devices nobody owns. `assignments: { none: {} }` rather than a
       * null `personnelId`: the schema still has that column but the app
       * assigns through device_assignments, and a device can have more than
       * one technician on it.
       */
      prisma.device.count({
        where: { ...openDevice, assignments: { none: {} } },
      }),
      /*
       * The assignments themselves, counted in JS.
       *
       * groupBy would count them in one query but cannot bring the name
       * along, so it would be a groupBy plus a findMany over the ids it
       * returned — two round trips for a list that is at most one row per
       * open device per technician. A workshop has single digits of
       * technicians and hundreds of open devices at the very most.
       */
      prisma.deviceAssignment.findMany({
        where: { workspaceId, device: { status: { in: OPEN } } },
        select: {
          personnelId: true,
          personnel: { select: { fullName: true, username: true } },
        },
      }),
      /*
       * The two trend reads pull rows and bucket them in JS rather than
       * grouping in SQL. groupBy cannot group by a date's day — only by the
       * whole timestamp — so the alternative is $queryRaw with a date_trunc,
       * which would bypass the Prisma client extension that scopes every
       * query by workspace. Two weeks of one workshop's invoices is tens of
       * rows, and [workspaceId, invoiceDate] is already indexed, so the
       * safer form costs nothing here.
       */
      prisma.repairInvoice.findMany({
        where: { invoiceDate: trend, ...issuedOrPaid },
        select: { invoiceDate: true, totalAmount: true },
      }),
      prisma.saleInvoice.findMany({
        where: { workspaceId, invoiceDate: trend },
        select: { invoiceDate: true, totalAmount: true },
      }),
      prisma.repairInvoice.aggregate({
        where: { invoiceDate: month, ...issuedOrPaid },
        _sum: { totalAmount: true, paidAmount: true },
      }),
    ]);

    // Needs a second round trip: the ids only exist once the grouping above
    // has run.
    const topItemIds = topItemsGrouped
      .map((row) => row.itemId)
      .filter((id): id is number => id !== null);

    const topItemRecords = topItemIds.length
      ? await prisma.item.findMany({
          where: { id: { in: topItemIds }, workspaceId },
          select: { id: true, name: true, code: true },
        })
      : [];

    const topItemsById = new Map(topItemRecords.map((item) => [item.id, item]));

    const lowStockCount = items.filter(
      (item) => item.currentStock.toNumber() <= item.minStock.toNumber(),
    ).length;

    // Accepts undefined as well: Prisma types an aggregate's _sum as
    // optional, so the property access can produce it.
    const amount = (value: { toNumber(): number } | null | undefined) =>
      value?.toNumber() ?? 0;

    /*
     * How many open devices each technician has, busiest first.
     *
     * A device may carry more than one technician, so these counts can add
     * up to more than `openDevices` — each one answers "how much is on this
     * person's bench", not "what share of the total is theirs". The card
     * scales its bars against the busiest person rather than against a sum
     * for exactly that reason.
     *
     * The username is the fallback name because it is never null and it is a
     * phone number, which a shop will recognise. `fullName` is a form field
     * and can be blank.
     */
    const loadByTechnician = new Map<number, { name: string; count: number }>();
    for (const assignment of openAssignments) {
      const existing = loadByTechnician.get(assignment.personnelId);
      if (existing) {
        existing.count += 1;
        continue;
      }
      loadByTechnician.set(assignment.personnelId, {
        name:
          assignment.personnel.fullName?.trim() ||
          assignment.personnel.username,
        count: 1,
      });
    }

    const technicianLoad = [...loadByTechnician.entries()]
      .map(([id, row]) => ({ id, name: row.name, count: row.count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fa"));

    /*
     * One bucket per day in the window, zero-filled before anything is added.
     * A day with no invoices has to reach the chart as a zero rather than be
     * missing: a line drawn over absent days joins Sunday to Tuesday and
     * hides the closure, and the x axis stops being evenly spaced.
     */
    const trendBuckets = new Map<string, { repair: number; sale: number }>();
    for (let i = 0; i < TREND_DAYS; i += 1) {
      const day = new Date(trend.gte);
      day.setUTCDate(day.getUTCDate() + i);
      trendBuckets.set(utcDayKey(day), { repair: 0, sale: 0 });
    }

    for (const invoice of trendRepairInvoices) {
      const bucket = trendBuckets.get(utcDayKey(invoice.invoiceDate));
      if (bucket) bucket.repair += invoice.totalAmount.toNumber();
    }
    for (const invoice of trendSaleInvoices) {
      const bucket = trendBuckets.get(utcDayKey(invoice.invoiceDate));
      if (bucket) bucket.sale += invoice.totalAmount.toNumber();
    }

    const monthRepairTotal = amount(monthRepairPayments._sum?.totalAmount);
    const monthRepairPaid = amount(monthRepairPayments._sum?.paidAmount);

    const todayPurchaseTotal = amount(todayPurchase._sum.totalAmount);
    const todaySaleTotal = amount(todaySale._sum.totalAmount);
    const monthPurchaseTotal = amount(monthPurchase._sum.totalAmount);
    const monthSaleTotal = amount(monthSale._sum.totalAmount);

    res.json({
      items: {
        total: totalItems,
        low_stock: lowStockCount,
      },
      today: {
        purchase: todayPurchaseTotal,
        sale: todaySaleTotal,
        net: todaySaleTotal - todayPurchaseTotal,
      },
      month: {
        purchase: monthPurchaseTotal,
        sale: monthSaleTotal,
        net: monthSaleTotal - monthPurchaseTotal,
      },
      recent_transactions: recentTransactions.map((tx) => ({
        id: tx.id,
        item_id: tx.itemId,
        type: tx.type,
        quantity: tx.quantity.toNumber(),
        unit_price: tx.unitPrice.toNumber(),
        created_at: tx.createdAt.toISOString(),
        item_name: tx.item.name,
        item_code: tx.item.code,
        // Quantities are decimal (14.1): «۲٫۵» needs «متر», not «عدد».
        item_unit: tx.item.unit,
      })),
      top_items: topItemsGrouped.map((row) => {
        const item = topItemsById.get(row.itemId as number);
        return {
          id: row.itemId,
          name: item?.name ?? null,
          code: item?.code ?? null,
          sold_quantity: row._sum.quantity?.toNumber() ?? 0,
          revenue: amount(row._sum.totalPrice),
        };
      }),
      devices: {
        total: totalDevices,
        today: todayDevices,
        repairing: repairingDevices,
        by_status: devicesByStatus.map((row) => ({
          status: row.status,
          count: row._count.status,
        })),
      },
      technician_load: {
        open_devices: openDevices,
        unassigned: unassignedDevices,
        technicians: technicianLoad,
      },
      repair_invoices: {
        today_count: todayRepairCount,
        today_revenue: amount(todayRepairRevenue._sum?.totalAmount),
        month_revenue: amount(monthRepairRevenue._sum?.totalAmount),
        pending_payment_count: pendingPaymentCount,
        issued_unpaid_amount:
          amount(unpaidTotals._sum?.totalAmount) -
          amount(unpaidTotals._sum?.paidAmount),
        /*
         * This month's billed amount split by what has actually come in.
         * month_revenue answers "how much did we bill"; these two answer
         * "how much of it did we collect", which is the number a workshop
         * chases. Floored at zero because an overpayment — a customer
         * rounding up — would otherwise send the remainder negative and put
         * a segment on the wrong side of the ring.
         */
        month_paid: monthRepairPaid,
        month_unpaid: Math.max(monthRepairTotal - monthRepairPaid, 0),
      },
      /*
       * Daily totals for the trend chart, oldest first, one entry per day
       * with no gaps. Dates are UTC day keys, the same boundary every other
       * window in this response uses.
       */
      revenue_series: [...trendBuckets.entries()].map(([date, totals]) => ({
        date,
        repair: totals.repair,
        sale: totals.sale,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};
