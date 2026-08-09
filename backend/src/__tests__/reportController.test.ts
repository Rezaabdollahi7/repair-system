import { Request, Response } from "express";
import * as controller from "../controllers/reportController";
import prisma from "../lib/prisma";

jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: {
    item: { findMany: jest.fn(), count: jest.fn() },
    purchaseInvoice: { findMany: jest.fn(), aggregate: jest.fn() },
    saleInvoice: { findMany: jest.fn(), aggregate: jest.fn() },
    saleInvoiceItem: { groupBy: jest.fn() },
    repairInvoice: { count: jest.fn(), aggregate: jest.fn() },
    inventoryTransaction: { findMany: jest.fn() },
    device: { count: jest.fn(), groupBy: jest.fn() },
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
    currentStock: 20,
    minStock: 5,
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
    db.item.findMany.mockResolvedValue([itemRow({ currentStock: 0 })]);

    const res = mockResponse();
    await controller.getStockReport(mockRequest({ query: {} }), res);

    expect(res.json.mock.calls[0][0].data[0].stock_status).toBe("critical");
  });

  it("marks an item at its minimum as low, not good", async () => {
    db.item.findMany.mockResolvedValue([
      itemRow({ currentStock: 5, minStock: 5 }),
    ]);

    const res = mockResponse();
    await controller.getStockReport(mockRequest({ query: {} }), res);

    expect(res.json.mock.calls[0][0].data[0].stock_status).toBe("low");
  });

  it("keeps only low and critical items when asked", async () => {
    db.item.findMany.mockResolvedValue([
      itemRow({ id: 1, currentStock: 20, minStock: 5 }),
      itemRow({ id: 2, currentStock: 0, minStock: 5 }),
      itemRow({ id: 3, currentStock: 3, minStock: 5 }),
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
      itemRow({ currentStock: 20, avgPurchasePrice: decimal(1000) }),
      itemRow({ id: 2, currentStock: 5, avgPurchasePrice: decimal(2000) }),
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
        items: [{ quantity: 4 }, { quantity: 6 }],
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
        items: [{ quantity: 2 }],
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

describe("reportController.getProfitReport", () => {
  it("ignores custom lines, which carry no known cost", async () => {
    db.saleInvoiceItem.groupBy.mockResolvedValue([]);

    await controller.getProfitReport(
      mockRequest({ query: {} }),
      mockResponse(),
    );

    expect(db.saleInvoiceItem.groupBy.mock.calls[0][0].where).toMatchObject({
      workspaceId: WORKSPACE_ID,
      itemId: { not: null },
    });
  });

  it("computes profit and margin per item", async () => {
    db.saleInvoiceItem.groupBy.mockResolvedValue([
      {
        itemId: 1,
        _sum: { quantity: 10, totalPrice: decimal(50000) },
      },
    ]);
    db.item.findMany.mockResolvedValue([
      { id: 1, name: "خازن", code: "C-100", avgPurchasePrice: decimal(2000) },
    ]);

    const res = mockResponse();
    await controller.getProfitReport(mockRequest({ query: {} }), res);

    // Revenue 50000 against a cost of 10 x 2000.
    expect(res.json.mock.calls[0][0].data[0]).toMatchObject({
      total_revenue: 50000,
      total_cost: 20000,
      profit: 30000,
      profit_margin: 60,
    });
  });

  it("costs items from the caller's own catalogue", async () => {
    db.saleInvoiceItem.groupBy.mockResolvedValue([
      { itemId: 1, _sum: { quantity: 1, totalPrice: decimal(1000) } },
    ]);
    db.item.findMany.mockResolvedValue([]);

    await controller.getProfitReport(
      mockRequest({ query: {} }),
      mockResponse(),
    );

    expect(db.item.findMany.mock.calls[0][0].where).toMatchObject({
      workspaceId: WORKSPACE_ID,
    });
  });

  it("orders the most profitable item first", async () => {
    db.saleInvoiceItem.groupBy.mockResolvedValue([
      { itemId: 1, _sum: { quantity: 1, totalPrice: decimal(1000) } },
      { itemId: 2, _sum: { quantity: 1, totalPrice: decimal(9000) } },
    ]);
    db.item.findMany.mockResolvedValue([
      { id: 1, name: "الف", code: "A", avgPurchasePrice: decimal(0) },
      { id: 2, name: "ب", code: "B", avgPurchasePrice: decimal(0) },
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
    db.saleInvoiceItem.groupBy.mockResolvedValue([
      { itemId: 1, _sum: { quantity: 0, totalPrice: decimal(0) } },
    ]);
    db.item.findMany.mockResolvedValue([
      { id: 1, name: "خازن", code: "C-100", avgPurchasePrice: decimal(0) },
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

    // Seventeen parallel queries; a workspace filter missing from any one of
    // them would leak another shop's figures into this dashboard.
    const everyWhere = [
      ...db.repairInvoice.count.mock.calls,
      ...db.repairInvoice.aggregate.mock.calls,
      ...db.item.count.mock.calls,
      ...db.item.findMany.mock.calls,
      ...db.purchaseInvoice.aggregate.mock.calls,
      ...db.saleInvoice.aggregate.mock.calls,
      ...db.inventoryTransaction.findMany.mock.calls,
      ...db.saleInvoiceItem.groupBy.mock.calls,
      ...db.device.count.mock.calls,
      ...db.device.groupBy.mock.calls,
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
      { currentStock: 20, minStock: 5 },
      { currentStock: 2, minStock: 5 },
      { currentStock: 5, minStock: 5 },
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
      { itemId: 1, _sum: { quantity: 12, totalPrice: decimal(90000) } },
    ]);
    db.item.findMany.mockResolvedValue([
      { id: 1, name: "خازن", code: "C-100" },
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
});
