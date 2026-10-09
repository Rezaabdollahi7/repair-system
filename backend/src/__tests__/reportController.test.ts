import { Request, Response } from "express";
import * as controller from "../controllers/reportController";
import prisma from "../lib/prisma";

jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: {
    item: { findMany: jest.fn(), count: jest.fn() },
    purchaseInvoice: { findMany: jest.fn(), aggregate: jest.fn() },
    saleInvoice: { findMany: jest.fn(), aggregate: jest.fn() },
    saleInvoiceItem: { groupBy: jest.fn(), findMany: jest.fn() },
    warehouse: { findFirst: jest.fn() },
    repairInvoice: {
      count: jest.fn(),
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    inventoryTransaction: { findMany: jest.fn() },
    device: { count: jest.fn(), groupBy: jest.fn() },
    deviceAssignment: { findMany: jest.fn() },
  },
}));

const db = prisma as unknown as {
  item: Record<string, jest.Mock>;
  purchaseInvoice: Record<string, jest.Mock>;
  saleInvoice: Record<string, jest.Mock>;
  saleInvoiceItem: Record<string, jest.Mock>;
  repairInvoice: Record<string, jest.Mock>;
  inventoryTransaction: Record<string, jest.Mock>;
  device: Record<string, jest.Mock>;
  deviceAssignment: Record<string, jest.Mock>;
  warehouse: Record<string, jest.Mock>;
};

function decimal(value: number) {
  return { toNumber: () => value };
}

function mockResponse() {
  const res = {} as Response & { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// Every report reads workspaceIdOf(req), which throws when the token carried
// no workspace — so the mock has to supply one.
const WORKSPACE_ID = 1;

function mockRequest(valid: Record<string, unknown> = {}) {
  return {
    valid: { body: undefined, params: undefined, query: undefined, ...valid },
    user: { id: 3, workspaceId: WORKSPACE_ID, role: "super_admin" },
  } as unknown as Request;
}

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    code: "C-100",
    name: "خازن",
    unit: "عدد",
    currentStock: decimal(20),
    minStock: decimal(5),
    avgPurchasePrice: decimal(1000),
    category: { name: "قطعات" },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("reportController.getStockReport", () => {
  it("marks an item with no stock as critical", async () => {
    db.item.findMany.mockResolvedValue([itemRow({ currentStock: decimal(0) })]);

    const res = mockResponse();
    await controller.getStockReport(mockRequest({ query: {} }), res);

    expect(res.json.mock.calls[0][0].data[0].stock_status).toBe("critical");
  });

  it("marks an item at its minimum as low, not good", async () => {
    db.item.findMany.mockResolvedValue([
      itemRow({ currentStock: decimal(5), minStock: decimal(5) }),
    ]);

    const res = mockResponse();
    await controller.getStockReport(mockRequest({ query: {} }), res);

    expect(res.json.mock.calls[0][0].data[0].stock_status).toBe("low");
  });

  it("keeps only low and critical items when asked", async () => {
    db.item.findMany.mockResolvedValue([
      itemRow({ id: 1, currentStock: decimal(20), minStock: decimal(5) }),
      itemRow({ id: 2, currentStock: decimal(0), minStock: decimal(5) }),
      itemRow({ id: 3, currentStock: decimal(3), minStock: decimal(5) }),
    ]);

    const res = mockResponse();
    await controller.getStockReport(
      mockRequest({ query: { lowStockOnly: "true" } }),
      res,
    );

    expect(
      res.json.mock.calls[0][0].data.map((row: { id: number }) => row.id),
    ).toEqual([2, 3]);
  });

  it("values the inventory at each item's average purchase price", async () => {
    db.item.findMany.mockResolvedValue([
      itemRow({ currentStock: decimal(20), avgPurchasePrice: decimal(1000) }),
      itemRow({
        id: 2,
        currentStock: decimal(5),
        avgPurchasePrice: decimal(2000),
      }),
    ]);

    const res = mockResponse();
    await controller.getStockReport(mockRequest({ query: {} }), res);

    expect(res.json.mock.calls[0][0].summary).toMatchObject({
      total_items: 2,
      total_inventory_value: 30000,
    });
  });

  it("excludes inactive items and other workspaces", async () => {
    db.item.findMany.mockResolvedValue([]);

    await controller.getStockReport(mockRequest({ query: {} }), mockResponse());

    expect(db.item.findMany.mock.calls[0][0].where).toMatchObject({
      isActive: true,
      workspaceId: WORKSPACE_ID,
    });
  });
});

describe("reportController.getStockReport with a warehouse", () => {
  it("keeps only items that hold stock there", async () => {
    db.warehouse.findFirst.mockResolvedValue({ id: 7 });
    db.item.findMany.mockResolvedValue([]);

    await controller.getStockReport(
      mockRequest({ query: { warehouseId: 7 } }),
      mockResponse(),
    );

    const args = db.item.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      workspaceId: WORKSPACE_ID,
      stocks: { some: { warehouseId: 7, quantity: { gt: 0 } } },
    });
    expect(args.select.stocks).toEqual({
      where: { warehouseId: 7 },
      select: { quantity: true },
    });
  });

  it("looks the warehouse up in the caller's workspace and 404s otherwise", async () => {
    db.warehouse.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.getStockReport(
      mockRequest({ query: { warehouseId: 99 } }),
      res,
    );

    expect(db.warehouse.findFirst.mock.calls[0][0].where).toEqual({
      id: 99,
      workspaceId: WORKSPACE_ID,
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.item.findMany).not.toHaveBeenCalled();
  });

  it("values the warehouse's quantity, shortest shelf first, status from the total", async () => {
    db.warehouse.findFirst.mockResolvedValue({ id: 7 });
    db.item.findMany.mockResolvedValue([
      itemRow({
        id: 1,
        currentStock: decimal(20),
        minStock: decimal(5),
        avgPurchasePrice: decimal(1000),
        stocks: [{ quantity: decimal(6) }],
      }),
      itemRow({
        id: 2,
        currentStock: decimal(30),
        minStock: decimal(5),
        avgPurchasePrice: decimal(2000),
        stocks: [{ quantity: decimal(2) }],
      }),
    ]);

    const res = mockResponse();
    await controller.getStockReport(
      mockRequest({ query: { warehouseId: 7 } }),
      res,
    );

    const body = res.json.mock.calls[0][0];
    expect(body.data.map((row: { id: number }) => row.id)).toEqual([2, 1]);
    expect(body.data[0]).toMatchObject({
      current_stock: 30,
      warehouse_stock: 2,
      // Two in this warehouse, thirty in all against a minimum of five.
      stock_status: "good",
    });
    // 6 × 1000 + 2 × 2000, not the totals.
    expect(body.summary.total_inventory_value).toBe(10000);
  });

  it("reports no warehouse figure without the filter", async () => {
    db.item.findMany.mockResolvedValue([itemRow()]);

    const res = mockResponse();
    await controller.getStockReport(mockRequest({ query: {} }), res);

    expect(res.json.mock.calls[0][0].data[0].warehouse_stock).toBeNull();
    expect(db.warehouse.findFirst).not.toHaveBeenCalled();
    expect(db.item.findMany.mock.calls[0][0].select.stocks).toBeUndefined();
  });
});

describe("reportController.getPurchaseReport", () => {
  it("counts lines and sums quantities per invoice", async () => {
    db.purchaseInvoice.findMany.mockResolvedValue([
      {
        id: 1,
        invoiceNumber: "PUR-20260806-001",
        supplierName: "پارس",
        invoiceDate: new Date("2026-08-06T00:00:00.000Z"),
        totalAmount: decimal(30000),
        paidAmount: decimal(10000),
        paymentStatus: "partial",
        items: [{ quantity: decimal(4) }, { quantity: decimal(6) }],
      },
    ]);

    const res = mockResponse();
    await controller.getPurchaseReport(mockRequest({ query: {} }), res);

    expect(res.json.mock.calls[0][0].data[0]).toMatchObject({
      item_count: 2,
      total_quantity: 10,
    });
    expect(res.json.mock.calls[0][0].summary).toEqual({
      total_invoices: 1,
      total_purchase_amount: 30000,
      total_paid_amount: 10000,
      total_remaining: 20000,
    });
  });

  it("includes invoices recorded during the day the range ends on", async () => {
    db.purchaseInvoice.findMany.mockResolvedValue([]);

    const to = new Date("2026-01-31T00:00:00.000Z");
    await controller.getPurchaseReport(
      mockRequest({ query: { to_date: to } }),
      mockResponse(),
    );

    // A bare lte on the parsed date would stop at midnight and drop
    // everything recorded on the 31st itself.
    const filter = db.purchaseInvoice.findMany.mock.calls[0][0].where
      .invoiceDate as { lte: Date };
    expect(filter.lte.getUTCHours()).toBe(23);
    expect(filter.lte.getUTCDate()).toBe(31);
  });

  it("still scopes by workspace when no date bound is given", async () => {
    db.purchaseInvoice.findMany.mockResolvedValue([]);

    await controller.getPurchaseReport(
      mockRequest({ query: {} }),
      mockResponse(),
    );

    expect(db.purchaseInvoice.findMany.mock.calls[0][0].where).toEqual({
      workspaceId: WORKSPACE_ID,
    });
  });
});

describe("reportController.getSaleReport", () => {
  it("summarises sales and what remains outstanding", async () => {
    db.saleInvoice.findMany.mockResolvedValue([
      {
        id: 1,
        invoiceNumber: "SAL-20260806-001",
        customerName: "رضا",
        customerPhone: "0912",
        invoiceDate: new Date("2026-08-06T00:00:00.000Z"),
        totalAmount: decimal(50000),
        paidAmount: decimal(50000),
        paymentStatus: "paid",
        items: [{ quantity: decimal(2) }],
      },
    ]);

    const res = mockResponse();
    await controller.getSaleReport(mockRequest({ query: {} }), res);

    expect(res.json.mock.calls[0][0].summary).toEqual({
      total_invoices: 1,
      total_sales_amount: 50000,
      total_received_amount: 50000,
      total_remaining: 0,
    });
  });

  it("scopes the report to the caller's workspace", async () => {
    db.saleInvoice.findMany.mockResolvedValue([]);

    await controller.getSaleReport(mockRequest({ query: {} }), mockResponse());

    expect(db.saleInvoice.findMany.mock.calls[0][0].where).toEqual({
      workspaceId: WORKSPACE_ID,
    });
  });
});

function saleLine(overrides: Record<string, unknown> = {}) {
  return {
    itemId: 1,
    quantity: decimal(1),
    totalPrice: decimal(1000),
    unitCost: decimal(0),
    item: { name: "خازن", code: "C-100", avgPurchasePrice: decimal(0) },
    ...overrides,
  };
}

describe("reportController.getProfitReport", () => {
  it("ignores custom lines, which carry no known cost", async () => {
    db.saleInvoiceItem.findMany.mockResolvedValue([]);

    await controller.getProfitReport(
      mockRequest({ query: {} }),
      mockResponse(),
    );

    expect(db.saleInvoiceItem.findMany.mock.calls[0][0].where).toMatchObject({
      workspaceId: WORKSPACE_ID,
      itemId: { not: null },
    });
  });

  it("computes profit and margin per item", async () => {
    db.saleInvoiceItem.findMany.mockResolvedValue([
      saleLine({
        quantity: decimal(4),
        totalPrice: decimal(20000),
        unitCost: decimal(2000),
      }),
      saleLine({
        quantity: decimal(6),
        totalPrice: decimal(30000),
        unitCost: decimal(2000),
      }),
    ]);

    const res = mockResponse();
    await controller.getProfitReport(mockRequest({ query: {} }), res);

    // Revenue 50000 against a cost of 10 x 2000.
    expect(res.json.mock.calls[0][0].data).toEqual([
      expect.objectContaining({
        item_id: 1,
        total_quantity: 10,
        total_revenue: 50000,
        total_cost: 20000,
        profit: 30000,
        profit_margin: 60,
      }),
    ]);
  });

  it("costs each line at what it cost when it was sold, not at today's average", async () => {
    // Sold at a cost of 1000; the item has since been restocked dearer.
    db.saleInvoiceItem.findMany.mockResolvedValue([
      saleLine({
        quantity: decimal(2),
        totalPrice: decimal(5000),
        unitCost: decimal(1000),
        item: { name: "خازن", code: "C-100", avgPurchasePrice: decimal(2400) },
      }),
    ]);

    const res = mockResponse();
    await controller.getProfitReport(mockRequest({ query: {} }), res);

    expect(res.json.mock.calls[0][0].data[0]).toMatchObject({
      total_cost: 2000,
      profit: 3000,
    });
  });

  it("falls back to the current average for a line written before costs were stored", async () => {
    db.saleInvoiceItem.findMany.mockResolvedValue([
      saleLine({
        quantity: decimal(2),
        totalPrice: decimal(5000),
        unitCost: null,
        item: { name: "خازن", code: "C-100", avgPurchasePrice: decimal(1500) },
      }),
    ]);

    const res = mockResponse();
    await controller.getProfitReport(mockRequest({ query: {} }), res);

    expect(res.json.mock.calls[0][0].data[0].total_cost).toBe(3000);
  });

  it("does not leave floating-point dust on a fractional quantity", async () => {
    db.saleInvoiceItem.findMany.mockResolvedValue([
      saleLine({
        quantity: decimal(0.4),
        totalPrice: decimal(20000),
        unitCost: decimal(30000),
      }),
      saleLine({
        quantity: decimal(0.2),
        totalPrice: decimal(10000),
        unitCost: decimal(30000),
      }),
    ]);

    const res = mockResponse();
    await controller.getProfitReport(mockRequest({ query: {} }), res);

    const body = res.json.mock.calls[0][0];
    expect(body.data[0]).toMatchObject({
      total_quantity: 0.6,
      total_cost: 18000,
      profit: 12000,
    });
    expect(body.summary.total_cost).toBe(18000);
  });

  it("filters by the invoice's date", async () => {
    db.saleInvoiceItem.findMany.mockResolvedValue([]);

    await controller.getProfitReport(
      mockRequest({
        query: {
          from_date: new Date("2026-10-01T00:00:00Z"),
          to_date: new Date("2026-10-09T00:00:00Z"),
        },
      }),
      mockResponse(),
    );

    expect(
      db.saleInvoiceItem.findMany.mock.calls[0][0].where.invoice.invoiceDate,
    ).toBeDefined();
  });

  it("orders the most profitable item first", async () => {
    db.saleInvoiceItem.findMany.mockResolvedValue([
      saleLine({ itemId: 1, totalPrice: decimal(1000) }),
      saleLine({ itemId: 2, totalPrice: decimal(9000) }),
    ]);

    const res = mockResponse();
    await controller.getProfitReport(mockRequest({ query: {} }), res);

    expect(
      res.json.mock.calls[0][0].data.map(
        (row: { item_id: number }) => row.item_id,
      ),
    ).toEqual([2, 1]);
  });

  it("reports a zero margin rather than dividing by zero", async () => {
    db.saleInvoiceItem.findMany.mockResolvedValue([
      saleLine({ quantity: decimal(0), totalPrice: decimal(0) }),
    ]);

    const res = mockResponse();
    await controller.getProfitReport(mockRequest({ query: {} }), res);

    expect(res.json.mock.calls[0][0].data[0].profit_margin).toBe(0);
    expect(res.json.mock.calls[0][0].summary.profit_margin).toBe(0);
  });
});

describe("reportController.getDashboardStats", () => {
  function stubDashboard() {
    db.repairInvoice.count.mockResolvedValue(0);
    db.repairInvoice.aggregate.mockResolvedValue({
      _sum: { totalAmount: null, paidAmount: null },
    });
    db.item.count.mockResolvedValue(0);
    db.item.findMany.mockResolvedValue([]);
    db.purchaseInvoice.aggregate.mockResolvedValue({
      _sum: { totalAmount: null },
    });
    db.saleInvoice.aggregate.mockResolvedValue({
      _sum: { totalAmount: null },
    });
    db.inventoryTransaction.findMany.mockResolvedValue([]);
    db.saleInvoiceItem.groupBy.mockResolvedValue([]);
    db.device.count.mockResolvedValue(0);
    db.device.groupBy.mockResolvedValue([]);
    db.deviceAssignment.findMany.mockResolvedValue([]);
    // The two reads behind the trend series. Rows rather than aggregates,
    // because a daily bucket cannot be grouped in SQL through Prisma.
    db.repairInvoice.findMany.mockResolvedValue([]);
    db.saleInvoice.findMany.mockResolvedValue([]);
  }

  it("reports zeros rather than nulls on an empty database", async () => {
    stubDashboard();

    const res = mockResponse();
    await controller.getDashboardStats(mockRequest(), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.today).toEqual({ purchase: 0, sale: 0, net: 0 });
    expect(payload.month).toEqual({ purchase: 0, sale: 0, net: 0 });
    expect(payload.repair_invoices.issued_unpaid_amount).toBe(0);
  });

  it("scopes every one of its reads to the caller's workspace", async () => {
    stubDashboard();

    await controller.getDashboardStats(mockRequest(), mockResponse());

    // Twenty-three parallel queries; a workspace filter missing from any
    // one of them would leak another shop's figures into this dashboard.
    const everyWhere = [
      ...db.repairInvoice.count.mock.calls,
      ...db.repairInvoice.aggregate.mock.calls,
      ...db.repairInvoice.findMany.mock.calls,
      ...db.item.count.mock.calls,
      ...db.item.findMany.mock.calls,
      ...db.purchaseInvoice.aggregate.mock.calls,
      ...db.saleInvoice.aggregate.mock.calls,
      ...db.saleInvoice.findMany.mock.calls,
      ...db.inventoryTransaction.findMany.mock.calls,
      ...db.saleInvoiceItem.groupBy.mock.calls,
      ...db.device.count.mock.calls,
      ...db.device.groupBy.mock.calls,
      ...db.deviceAssignment.findMany.mock.calls,
    ].map(([args]) => args?.where);

    expect(everyWhere.length).toBeGreaterThan(0);
    for (const where of everyWhere) {
      expect(where).toMatchObject({ workspaceId: WORKSPACE_ID });
    }
  });

  it("derives the outstanding amount from the difference of two sums", async () => {
    stubDashboard();
    db.repairInvoice.aggregate.mockResolvedValue({
      _sum: { totalAmount: decimal(500000), paidAmount: decimal(120000) },
    });

    const res = mockResponse();
    await controller.getDashboardStats(mockRequest(), res);

    // SUM(total - paid) isn't expressible in Prisma, but this is the same
    // figure.
    expect(res.json.mock.calls[0][0].repair_invoices.issued_unpaid_amount).toBe(
      380000,
    );
  });

  it("counts low stock by comparing each item's two columns", async () => {
    stubDashboard();
    db.item.findMany.mockResolvedValue([
      { currentStock: decimal(20), minStock: decimal(5) },
      { currentStock: decimal(2), minStock: decimal(5) },
      { currentStock: decimal(5), minStock: decimal(5) },
    ]);

    const res = mockResponse();
    await controller.getDashboardStats(mockRequest(), res);

    expect(res.json.mock.calls[0][0].items.low_stock).toBe(2);
  });

  it("nets the day's sales against its purchases", async () => {
    stubDashboard();
    db.purchaseInvoice.aggregate.mockResolvedValue({
      _sum: { totalAmount: decimal(30000) },
    });
    db.saleInvoice.aggregate.mockResolvedValue({
      _sum: { totalAmount: decimal(80000) },
    });

    const res = mockResponse();
    await controller.getDashboardStats(mockRequest(), res);

    expect(res.json.mock.calls[0][0].today).toEqual({
      purchase: 30000,
      sale: 80000,
      net: 50000,
    });
  });

  it("attaches item names to the top sellers", async () => {
    stubDashboard();
    db.saleInvoiceItem.groupBy.mockResolvedValue([
      {
        itemId: 1,
        _sum: { quantity: decimal(12), totalPrice: decimal(90000) },
      },
    ]);
    // One mock serves both item reads on the dashboard — the low-stock count
    // and the top sellers' names — so the row carries what each needs.
    db.item.findMany.mockResolvedValue([
      {
        id: 1,
        name: "خازن",
        code: "C-100",
        currentStock: decimal(20),
        minStock: decimal(5),
      },
    ]);

    const res = mockResponse();
    await controller.getDashboardStats(mockRequest(), res);

    expect(res.json.mock.calls[0][0].top_items[0]).toEqual({
      id: 1,
      name: "خازن",
      code: "C-100",
      sold_quantity: 12,
      revenue: 90000,
    });
  });

  it("returns one trend bucket per day, zero-filled and oldest first", async () => {
    stubDashboard();

    const res = mockResponse();
    await controller.getDashboardStats(mockRequest(), res);

    const series = res.json.mock.calls[0][0].revenue_series;

    // Fourteen days with no invoices at all still arrive as fourteen zeros:
    // a missing day would leave the chart's x axis unevenly spaced and let a
    // line be drawn straight over a day the workshop was closed.
    expect(series).toHaveLength(14);
    expect(
      series.every((point: { repair: number }) => point.repair === 0),
    ).toBe(true);
    expect(series[0].date < series[13].date).toBe(true);
  });

  it("buckets each trend invoice into its own UTC day", async () => {
    stubDashboard();

    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    db.repairInvoice.findMany.mockResolvedValue([
      { invoiceDate: today, totalAmount: decimal(40000) },
      { invoiceDate: today, totalAmount: decimal(60000) },
    ]);
    db.saleInvoice.findMany.mockResolvedValue([
      { invoiceDate: today, totalAmount: decimal(25000) },
    ]);

    const res = mockResponse();
    await controller.getDashboardStats(mockRequest(), res);

    const series = res.json.mock.calls[0][0].revenue_series;
    const bucket = series.find(
      (point: { date: string }) => point.date === todayKey,
    );

    // Two invoices on the same day sum into one bucket rather than producing
    // two points.
    expect(bucket).toEqual({ date: todayKey, repair: 100000, sale: 25000 });
  });

  it("splits the month's billing into collected and outstanding", async () => {
    stubDashboard();
    db.repairInvoice.aggregate.mockResolvedValue({
      _sum: { totalAmount: decimal(900000), paidAmount: decimal(350000) },
    });

    const res = mockResponse();
    await controller.getDashboardStats(mockRequest(), res);

    const invoices = res.json.mock.calls[0][0].repair_invoices;
    expect(invoices.month_paid).toBe(350000);
    expect(invoices.month_unpaid).toBe(550000);
  });

  it("floors the outstanding month total at zero when a customer overpays", async () => {
    stubDashboard();
    db.repairInvoice.aggregate.mockResolvedValue({
      _sum: { totalAmount: decimal(100000), paidAmount: decimal(120000) },
    });

    const res = mockResponse();
    await controller.getDashboardStats(mockRequest(), res);

    // A negative remainder would draw a ring segment on the wrong side.
    expect(res.json.mock.calls[0][0].repair_invoices.month_unpaid).toBe(0);
  });

  it("flattens the device status grouping", async () => {
    stubDashboard();
    db.device.groupBy.mockResolvedValue([
      { status: "repairing", _count: { status: 4 } },
      { status: "delivered", _count: { status: 2 } },
    ]);

    const res = mockResponse();
    await controller.getDashboardStats(mockRequest(), res);

    expect(res.json.mock.calls[0][0].devices.by_status).toEqual([
      { status: "repairing", count: 4 },
      { status: "delivered", count: 2 },
    ]);
  });

  it("counts each technician's open devices, busiest first", async () => {
    stubDashboard();
    db.deviceAssignment.findMany.mockResolvedValue([
      {
        personnelId: 2,
        personnel: { fullName: "علی رضایی", username: "09120000002" },
      },
      {
        personnelId: 3,
        personnel: { fullName: "سارا نوری", username: "09120000003" },
      },
      {
        personnelId: 2,
        personnel: { fullName: "علی رضایی", username: "09120000002" },
      },
      {
        personnelId: 2,
        personnel: { fullName: "علی رضایی", username: "09120000002" },
      },
    ]);

    const res = mockResponse();
    await controller.getDashboardStats(mockRequest(), res);

    expect(res.json.mock.calls[0][0].technician_load.technicians).toEqual([
      { id: 2, name: "علی رضایی", count: 3 },
      { id: 3, name: "سارا نوری", count: 1 },
    ]);
  });

  it("falls back to the username when a technician has no full name", async () => {
    stubDashboard();
    db.deviceAssignment.findMany.mockResolvedValue([
      {
        personnelId: 4,
        personnel: { fullName: "   ", username: "09120000004" },
      },
    ]);

    const res = mockResponse();
    await controller.getDashboardStats(mockRequest(), res);

    expect(res.json.mock.calls[0][0].technician_load.technicians).toEqual([
      { id: 4, name: "09120000004", count: 1 },
    ]);
  });

  it("reports an empty workload rather than omitting it", async () => {
    stubDashboard();

    const res = mockResponse();
    await controller.getDashboardStats(mockRequest(), res);

    expect(res.json.mock.calls[0][0].technician_load).toEqual({
      open_devices: 0,
      unassigned: 0,
      technicians: [],
    });
  });

  it("counts only devices a technician still has work on", async () => {
    stubDashboard();

    await controller.getDashboardStats(mockRequest(), mockResponse());

    // «در حال تعمیر» keeps the three statuses it has always counted; the
    // workload card adds the ones that have arrived and not been looked at.
    const statusFilters = db.device.count.mock.calls
      .map(([args]) => args?.where?.status?.in)
      .filter(Boolean);

    expect(statusFilters).toContainEqual([
      "diagnosing",
      "repairing",
      "waiting_for_parts",
    ]);
    expect(statusFilters).toContainEqual([
      "pending",
      "diagnosing",
      "repairing",
      "waiting_for_parts",
    ]);
    expect(db.deviceAssignment.findMany.mock.calls[0][0].where.device).toEqual({
      status: {
        in: ["pending", "diagnosing", "repairing", "waiting_for_parts"],
      },
    });
  });

  it("asks for unassigned devices by the absence of an assignment", async () => {
    stubDashboard();

    await controller.getDashboardStats(mockRequest(), mockResponse());

    // Not a null personnelId: that column is still on the table but the app
    // assigns through device_assignments, and a device may have several.
    const unassigned = db.device.count.mock.calls
      .map(([args]) => args?.where)
      .find((where) => where?.assignments !== undefined);

    expect(unassigned?.assignments).toEqual({ none: {} });
  });
});
