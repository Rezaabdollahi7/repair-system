import { Request, Response } from "express";
import prisma from "../lib/prisma";
import type { Prisma } from "../generated/prisma/client";
import { ValidatedRequest } from "../middleware/validate";
import { dateFilter, monthRange, todayRange } from "../utils/dateRange";
import { errorMessage } from "../utils/errors";
import type { DateRangeQuery, StockReportQuery } from "../schemas/report";
import { workspaceIdOf } from "../utils/workspace";

type StockStatus = "critical" | "low" | "good";

function stockStatus(currentStock: number, minStock: number): StockStatus {
  if (currentStock === 0) return "critical";
  if (currentStock <= minStock) return "low";
  return "good";
}

// GET /api/reports/stock
export const getStockReport = async (req: Request, res: Response) => {
  try {
    const query = (req as ValidatedRequest).valid.query as StockReportQuery;

    const where: Prisma.ItemWhereInput = {
      isActive: true,
      workspaceId: workspaceIdOf(req),
    };
    if (query.categoryId !== undefined) {
      where.categoryId = query.categoryId;
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
      },
    });

    // Both the status and the low-stock filter compare two columns against
    // each other, which Prisma can't express in where or orderBy.
    const rows = items.map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      current_stock: item.currentStock,
      min_stock: item.minStock,
      avg_purchase_price: item.avgPurchasePrice.toNumber(),
      category_name: item.category?.name ?? null,
      stock_status: stockStatus(item.currentStock, item.minStock),
    }));

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
        total_inventory_value: data.reduce(
          (sum, row) => sum + row.current_stock * row.avg_purchase_price,
          0,
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
        (sum, line) => sum + line.quantity,
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
        (sum, line) => sum + line.quantity,
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
export const getProfitReport = async (req: Request, res: Response) => {
  try {
    const { from_date, to_date } = (req as ValidatedRequest).valid
      .query as DateRangeQuery;

    const invoiceDate = dateFilter(from_date, to_date);
    const workspaceId = workspaceIdOf(req);

    // Custom sale lines carry no item_id and so no known cost — the old
    // query's inner join excluded them, and they stay excluded here.
    const grouped = await prisma.saleInvoiceItem.groupBy({
      by: ["itemId"],
      where: {
        workspaceId,
        itemId: { not: null },
        ...(invoiceDate ? { invoice: { invoiceDate } } : {}),
      },
      _sum: { quantity: true, totalPrice: true },
    });

    const itemIds = grouped
      .map((row) => row.itemId)
      .filter((id): id is number => id !== null);

    const items = itemIds.length
      ? await prisma.item.findMany({
          where: { id: { in: itemIds }, workspaceId },
          select: {
            id: true,
            name: true,
            code: true,
            avgPurchasePrice: true,
          },
        })
      : [];

    const itemsById = new Map(items.map((item) => [item.id, item]));

    const data = grouped
      .map((row) => {
        const item = itemsById.get(row.itemId as number);
        const quantity = row._sum?.quantity ?? 0;
        const revenue = row._sum?.totalPrice?.toNumber() ?? 0;

        // Cost uses the item's current average purchase price, not the price
        // at the time of sale, so past margins shift when an item is
        // restocked at a different price. Existing behaviour.
        const cost = quantity * (item?.avgPurchasePrice.toNumber() ?? 0);

        return {
          item_id: row.itemId,
          item_name: item?.name ?? null,
          item_code: item?.code ?? null,
          total_quantity: quantity,
          total_revenue: revenue,
          total_cost: cost,
          profit: revenue - cost,
          profit_margin: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
        };
      })
      .sort((a, b) => b.profit - a.profit);

    const totalRevenue = data.reduce((sum, row) => sum + row.total_revenue, 0);
    const totalCost = data.reduce((sum, row) => sum + row.total_cost, 0);
    const totalProfit = totalRevenue - totalCost;

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
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const today = todayRange();
    const month = monthRange();
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
        include: { item: { select: { name: true, code: true } } },
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
        where: {
          workspaceId,
          status: { in: ["diagnosing", "repairing", "waiting_for_parts"] },
        },
      }),
      prisma.device.groupBy({
        by: ["status"],
        where: { workspaceId },
        _count: { status: true },
        orderBy: { _count: { status: "desc" } },
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
      (item) => item.currentStock <= item.minStock,
    ).length;

    // Accepts undefined as well: Prisma types an aggregate's _sum as
    // optional, so the property access can produce it.
    const amount = (value: { toNumber(): number } | null | undefined) =>
      value?.toNumber() ?? 0;

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
        quantity: tx.quantity,
        unit_price: tx.unitPrice.toNumber(),
        created_at: tx.createdAt.toISOString(),
        item_name: tx.item.name,
        item_code: tx.item.code,
      })),
      top_items: topItemsGrouped.map((row) => {
        const item = topItemsById.get(row.itemId as number);
        return {
          id: row.itemId,
          name: item?.name ?? null,
          code: item?.code ?? null,
          sold_quantity: row._sum.quantity ?? 0,
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
      repair_invoices: {
        today_count: todayRepairCount,
        today_revenue: amount(todayRepairRevenue._sum?.totalAmount),
        month_revenue: amount(monthRepairRevenue._sum?.totalAmount),
        pending_payment_count: pendingPaymentCount,
        issued_unpaid_amount:
          amount(unpaidTotals._sum?.totalAmount) -
          amount(unpaidTotals._sum?.paidAmount),
      },
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};
