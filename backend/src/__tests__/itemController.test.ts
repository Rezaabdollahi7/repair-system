import { Request, Response } from "express";
import * as controller from "../controllers/itemController";
import prisma, { runInWorkspaceTransaction } from "../lib/prisma";
import { applyStockMovements, InsufficientStockError } from "../utils/stock";
import { resolveWarehouseId } from "../utils/warehouse";

jest.mock("../lib/prisma", () => {
  const tx = {
    workspace: { update: jest.fn() },
    purchaseInvoice: { create: jest.fn() },
    purchaseInvoiceItem: { create: jest.fn() },
    saleInvoice: { create: jest.fn() },
    saleInvoiceItem: { create: jest.fn() },
    item: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
    },
  };

  return {
    __esModule: true,
    default: {
      item: {
        count: jest.fn(),
        findMany: jest.fn(),
        // findFirst rather than findUnique: the controller pairs id with
        // workspaceId now, which findUnique can't express.
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        /*
         * Prisma's field references, which the stock filter uses to compare
         * currentStock against minStock inside the query. The real client
         * puts an opaque marker here that the query engine turns into a
         * column reference; a sentinel is enough for the assertions, and
         * without it the filter reads a property of undefined.
         */
        fields: { minStock: "REF(minStock)" },
      },

      inventoryTransaction: { count: jest.fn(), findMany: jest.fn() },
      purchaseInvoice: { findMany: jest.fn() },
      __tx: tx,
    },
    // Named alongside the default export now that controllers import both.
    // Runs the callback against the same mocks the assertions inspect.
    runInWorkspaceTransaction: jest.fn(
      (_workspaceId: number, fn: (client: unknown) => unknown) => fn(tx),
    ),
  };
});

const db = prisma as unknown as {
  item: Record<string, jest.Mock>;
  inventoryTransaction: Record<string, jest.Mock>;
  workspace: Record<string, jest.Mock>;
  purchaseInvoice: Record<string, jest.Mock>;

  __tx: {
    workspace: Record<string, jest.Mock>;
    purchaseInvoice: Record<string, jest.Mock>;
    purchaseInvoiceItem: Record<string, jest.Mock>;
    saleInvoice: Record<string, jest.Mock>;
    saleInvoiceItem: Record<string, jest.Mock>;
    item: Record<string, jest.Mock>;
  };
};

const runInTx = runInWorkspaceTransaction as unknown as jest.Mock;

// What moves the stock is the stock service's business, with suites of its
// own. Here: what each endpoint asks it to move. The error classes stay real
// for the controller's instanceof.
jest.mock("../utils/stock", () => ({
  ...jest.requireActual("../utils/stock"),
  applyStockMovements: jest.fn(),
}));

jest.mock("../utils/warehouse", () => ({
  resolveWarehouseId: jest.fn(),
}));

const applyMovements = applyStockMovements as unknown as jest.Mock;
const resolveWarehouse = resolveWarehouseId as unknown as jest.Mock;
const MAIN_WAREHOUSE = 4;

// Stands in for Prisma's Decimal, which the controller calls toNumber() on.
function decimal(value: number) {
  return { toNumber: () => value };
}

function mockResponse() {
  const res = {} as Response & { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// Every tenant-scoped handler reads workspaceIdOf(req), which throws when
// the token carried no workspace — so the mock always supplies one, even
// when a test doesn't care which user acted.
const WORKSPACE_ID = 1;

function mockRequest(valid: Record<string, unknown> = {}, actorId?: number) {
  return {
    valid: { body: undefined, params: undefined, query: undefined, ...valid },
    user: { id: actorId ?? null, workspaceId: WORKSPACE_ID },
  } as unknown as Request;
}

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    categoryId: 2,
    name: "خازن",
    code: "C-100",
    unit: "عدد",
    minStock: decimal(5),
    currentStock: decimal(20),
    avgPurchasePrice: decimal(1000),
    description: null,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    sellPrice: decimal(1500),
    isFractional: false,
    category: { name: "قطعات" },
    ...overrides,
  };
}

const duplicateError = Object.assign(new Error("Unique constraint failed"), {
  code: "P2002",
});

const listQuery = { page: 1, limit: 10 };

beforeEach(() => {
  jest.clearAllMocks();
  resolveWarehouse.mockResolvedValue(MAIN_WAREHOUSE);
  applyMovements.mockResolvedValue([]);
});

describe("itemController.getAll", () => {
  it("answers in camelCase with Decimal columns as numbers", async () => {
    db.item.count.mockResolvedValue(1);
    db.item.findMany.mockResolvedValue([itemRow()]);

    const res = mockResponse();
    await controller.getAll(mockRequest({ query: listQuery }), res);

    expect(res.json.mock.calls[0][0].data[0]).toEqual({
      id: 1,
      categoryId: 2,
      name: "خازن",
      code: "C-100",
      unit: "عدد",
      minStock: 5,
      currentStock: 20,
      avgPurchasePrice: 1000,
      description: null,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      sellPrice: 1500,
      categoryName: "قطعات",
      isFractional: false,
    });
  });

  it("filters by category when given one", async () => {
    db.item.count.mockResolvedValue(0);
    db.item.findMany.mockResolvedValue([]);

    await controller.getAll(
      mockRequest({ query: { ...listQuery, categoryId: 3 } }),
      mockResponse(),
    );

    expect(db.item.findMany.mock.calls[0][0].where).toEqual({
      workspaceId: WORKSPACE_ID,
      categoryId: 3,
    });
  });

  /*
   * The three stock buckets are asserted on the where clause rather than on
   * the rows, because that is the whole point of the change: the filter has
   * to reach the database. The page used to narrow its own rows after
   * fetching them, so a shop asking for low-stock items got only the ones
   * that happened to land on page one, under a total that counted every item
   * it had.
   */
  it("asks the database for items that have run out", async () => {
    db.item.count.mockResolvedValue(0);
    db.item.findMany.mockResolvedValue([]);

    await controller.getAll(
      mockRequest({ query: { ...listQuery, stock: "out" } }),
      mockResponse(),
    );

    expect(db.item.findMany.mock.calls[0][0].where).toEqual({
      workspaceId: WORKSPACE_ID,
      currentStock: { lte: 0 },
    });
  });

  it("compares stock against each item's own minimum for the low bucket", async () => {
    db.item.count.mockResolvedValue(0);
    db.item.findMany.mockResolvedValue([]);

    await controller.getAll(
      mockRequest({ query: { ...listQuery, stock: "low" } }),
      mockResponse(),
    );

    // `gt: 0` as well as the column comparison: an item with nothing left
    // belongs in the "out" bucket, not this one — the same order
    // stockStatus() uses.
    expect(db.item.findMany.mock.calls[0][0].where).toEqual({
      workspaceId: WORKSPACE_ID,
      currentStock: { gt: 0, lte: "REF(minStock)" },
    });
  });

  it("takes everything above its minimum as in stock", async () => {
    db.item.count.mockResolvedValue(0);
    db.item.findMany.mockResolvedValue([]);

    await controller.getAll(
      mockRequest({ query: { ...listQuery, stock: "ok" } }),
      mockResponse(),
    );

    expect(db.item.findMany.mock.calls[0][0].where).toEqual({
      workspaceId: WORKSPACE_ID,
      currentStock: { gt: "REF(minStock)" },
    });
  });

  it("counts the same rows it returns when a stock filter is on", async () => {
    db.item.count.mockResolvedValue(0);
    db.item.findMany.mockResolvedValue([]);

    await controller.getAll(
      mockRequest({ query: { ...listQuery, stock: "low" } }),
      mockResponse(),
    );

    // The total drives the pager. It has to be counted over the filtered set,
    // or the page shows three rows and offers thirty pages of them.
    expect(db.item.count.mock.calls[0][0].where).toEqual(
      db.item.findMany.mock.calls[0][0].where,
    );
  });
});

describe("itemController.search", () => {
  it("matches code and name case-insensitively", async () => {
    db.item.count.mockResolvedValue(0);
    db.item.findMany.mockResolvedValue([]);

    await controller.search(
      mockRequest({ query: { ...listQuery, q: "خازن" } }),
      mockResponse(),
    );

    expect(db.item.findMany.mock.calls[0][0].where.OR).toEqual([
      { code: { contains: "خازن", mode: "insensitive" } },
      { name: { contains: "خازن", mode: "insensitive" } },
    ]);
  });

  it("combines a search term with a stock filter", async () => {
    db.item.count.mockResolvedValue(0);
    db.item.findMany.mockResolvedValue([]);

    await controller.search(
      mockRequest({ query: { ...listQuery, q: "خازن", stock: "out" } }),
      mockResponse(),
    );

    // Searching and filtering at once is the ordinary case — a shop looks for
    // a part and wants to know whether it has any — so the two have to end up
    // in the same where clause rather than one replacing the other.
    const where = db.item.findMany.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(2);
    expect(where.currentStock).toEqual({ lte: 0 });
  });
});

describe("itemController.getLowStock", () => {
  it("keeps only items at or below their minimum", async () => {
    db.item.findMany.mockResolvedValue([
      itemRow({ id: 1, currentStock: decimal(20), minStock: decimal(5) }),
      itemRow({ id: 2, currentStock: decimal(3), minStock: decimal(5) }),
      itemRow({ id: 3, currentStock: decimal(5), minStock: decimal(5) }),
    ]);

    const res = mockResponse();
    await controller.getLowStock(mockRequest(), res);

    expect(res.json.mock.calls[0][0].map((i: { id: number }) => i.id)).toEqual([
      2, 3,
    ]);
  });

  it("orders by how far below the minimum each item is", async () => {
    db.item.findMany.mockResolvedValue([
      itemRow({ id: 1, currentStock: decimal(4), minStock: decimal(5) }),
      itemRow({ id: 2, currentStock: decimal(0), minStock: decimal(10) }),
      itemRow({ id: 3, currentStock: decimal(2), minStock: decimal(5) }),
    ]);

    const res = mockResponse();
    await controller.getLowStock(mockRequest(), res);

    expect(res.json.mock.calls[0][0].map((i: { id: number }) => i.id)).toEqual([
      2, 3, 1,
    ]);
  });
});

describe("itemController.searchForInvoice", () => {
  it("only offers active items that have stock", async () => {
    db.item.findMany.mockResolvedValue([]);

    await controller.searchForInvoice(
      mockRequest({ query: { limit: 20 } }),
      mockResponse(),
    );

    expect(db.item.findMany.mock.calls[0][0].where).toMatchObject({
      workspaceId: WORKSPACE_ID,
      isActive: true,
      currentStock: { gt: 0 },
    });
  });

  it("answers in snake_case, unlike the other item endpoints", async () => {
    db.item.findMany.mockResolvedValue([itemRow()]);

    const res = mockResponse();
    await controller.searchForInvoice(
      mockRequest({ query: { limit: 20 } }),
      res,
    );

    expect(res.json).toHaveBeenCalledWith([
      {
        id: 1,
        code: "C-100",
        name: "خازن",
        unit: "عدد",
        current_stock: 20,
        avg_purchase_price: 1000,
        sell_price: 1500,
        category_name: "قطعات",
        is_fractional: false,
      },
    ]);
  });
});

describe("itemController.getTransactions", () => {
  const query = { page: 1, limit: 20 };

  it("returns 404 for an unknown item", async () => {
    db.item.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.getTransactions(
      mockRequest({ params: { id: 9 }, query }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("resolves purchase invoice numbers for referencing rows", async () => {
    db.item.findFirst.mockResolvedValue({ id: 1 });
    db.inventoryTransaction.count.mockResolvedValue(2);
    db.inventoryTransaction.findMany.mockResolvedValue([
      {
        id: 10,
        itemId: 1,
        type: "purchase",
        quantity: decimal(5),
        unitPrice: decimal(1000),
        referenceId: 7,
        referenceType: "purchase_invoice",
        note: null,
        createdBy: 1,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        warehouseId: MAIN_WAREHOUSE,
        unitCost: decimal(1000),
        beforeQuantity: decimal(0),
        afterQuantity: decimal(5),
        reason: null,
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: 11,
        itemId: 1,
        type: "adjustment",
        quantity: decimal(-2),
        unitPrice: decimal(0),
        referenceId: null,
        referenceType: null,
        note: "اصلاح",
        createdBy: 1,
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
        warehouseId: MAIN_WAREHOUSE,
        unitCost: null,
        beforeQuantity: null,
        afterQuantity: null,
        reason: "damage",
        occurredAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ]);
    db.purchaseInvoice.findMany.mockResolvedValue([
      { id: 7, invoiceNumber: "PUR-20260101-001" },
    ]);

    const res = mockResponse();
    await controller.getTransactions(
      mockRequest({ params: { id: 1 }, query }),
      res,
    );

    const rows = res.json.mock.calls[0][0].data;
    expect(rows[0].purchase_invoice_number).toBe("PUR-20260101-001");
    expect(rows[1].purchase_invoice_number).toBeNull();
    // What the ledger has carried since 14.1, for the kardex.
    expect(rows[0]).toMatchObject({
      warehouse_id: MAIN_WAREHOUSE,
      unit_cost: 1000,
      before_quantity: 0,
      after_quantity: 5,
    });
    expect(rows[1]).toMatchObject({ unit_cost: null, reason: "damage" });
  });

  it("skips the invoice lookup when nothing references one", async () => {
    db.item.findFirst.mockResolvedValue({ id: 1 });
    db.inventoryTransaction.count.mockResolvedValue(0);
    db.inventoryTransaction.findMany.mockResolvedValue([]);

    await controller.getTransactions(
      mockRequest({ params: { id: 1 }, query }),
      mockResponse(),
    );

    expect(runInTx).not.toHaveBeenCalled();
  });
});

describe("itemController.create", () => {
  const body = {
    code: "C-100",
    name: "خازن",
    unit: "عدد",
    categoryId: 2,
    minStock: 5,
    description: null,
    sell_price: 1500,
    isFractional: false,
    openingStock: 0,
    openingCost: null,
    warehouseId: undefined,
  };

  beforeEach(() => {
    db.__tx.item.create.mockResolvedValue({ id: 1 });
    db.__tx.item.findFirstOrThrow.mockResolvedValue(itemRow());
  });

  it("maps sell_price onto the sellPrice column", async () => {
    const res = mockResponse();
    await controller.create(mockRequest({ body }), res);

    expect(db.__tx.item.create.mock.calls[0][0].data).toMatchObject({
      workspaceId: WORKSPACE_ID,
      code: "C-100",
      sellPrice: 1500,
      categoryId: 2,
      isFractional: false,
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("moves no stock when the item opens empty", async () => {
    await controller.create(mockRequest({ body }), mockResponse());

    expect(applyMovements).not.toHaveBeenCalled();
  });

  it("opens with its stock, at its cost, in the same transaction", async () => {
    // It used to be a second request: a purchase at zero, which dragged
    // the average towards nothing and burned an invoice number.
    await controller.create(
      mockRequest({ body: { ...body, openingStock: 12, openingCost: 800 } }, 3),
      mockResponse(),
    );

    expect(runInTx).toHaveBeenCalledTimes(1);
    expect(applyMovements.mock.calls[0][2]).toEqual({
      referenceType: null,
      referenceId: null,
      actorId: 3,
    });
    expect(applyMovements.mock.calls[0][3]).toEqual([
      {
        itemId: 1,
        warehouseId: MAIN_WAREHOUSE,
        quantity: 12,
        type: "opening",
        unitCost: 800,
        note: "موجودی اولیه",
      },
    ]);
    expect(db.__tx.purchaseInvoice.create).not.toHaveBeenCalled();
  });

  it("opens into the warehouse it names", async () => {
    resolveWarehouse.mockResolvedValue(9);

    await controller.create(
      mockRequest({
        body: { ...body, openingStock: 1, openingCost: 10, warehouseId: 9 },
      }),
      mockResponse(),
    );

    expect(resolveWarehouse).toHaveBeenCalledWith(
      expect.anything(),
      WORKSPACE_ID,
      9,
    );
    expect(applyMovements.mock.calls[0][3][0].warehouseId).toBe(9);
  });

  it("reports a duplicate code as 400", async () => {
    db.__tx.item.create.mockRejectedValue(duplicateError);

    const res = mockResponse();
    await controller.create(mockRequest({ body }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "این کد کالا قبلاً ثبت شده است",
    });
  });
});

describe("itemController.update", () => {
  it("refuses to make an item whole while it holds a fraction", async () => {
    // 2.5 metres of a whole-number item could never be moved again.
    db.item.findFirst.mockResolvedValue({ id: 1, currentStock: decimal(2.5) });

    const res = mockResponse();
    await controller.update(
      mockRequest({ params: { id: 1 }, body: { isFractional: false } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.item.update).not.toHaveBeenCalled();
  });

  it("lets a whole stock become whole-number", async () => {
    db.item.findFirst.mockResolvedValue({ id: 1, currentStock: decimal(3) });
    db.item.update.mockResolvedValue(itemRow());

    await controller.update(
      mockRequest({ params: { id: 1 }, body: { isFractional: false } }),
      mockResponse(),
    );

    expect(db.item.update.mock.calls[0][0].data).toEqual({
      isFractional: false,
    });
  });

  it("leaves absent fields untouched", async () => {
    db.item.findFirst.mockResolvedValue({ id: 1, currentStock: decimal(4) });
    db.item.update.mockResolvedValue(itemRow());

    await controller.update(
      mockRequest({ params: { id: 1 }, body: { minStock: 8 } }),
      mockResponse(),
    );

    expect(db.item.update.mock.calls[0][0].data).toEqual({ minStock: 8 });
  });

  it("disconnects the category when categoryId is null", async () => {
    db.item.findFirst.mockResolvedValue({ id: 1, currentStock: decimal(4) });
    db.item.update.mockResolvedValue(itemRow());

    await controller.update(
      mockRequest({ params: { id: 1 }, body: { categoryId: null } }),
      mockResponse(),
    );

    expect(db.item.update.mock.calls[0][0].data).toEqual({
      category: { disconnect: true },
    });
  });

  it("returns 404 without attempting the update", async () => {
    db.item.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.update(
      mockRequest({ params: { id: 9 }, body: { minStock: 8 } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(runInTx).not.toHaveBeenCalled();
  });
});

describe("itemController.remove", () => {
  it("refuses when the item appears on an invoice, not just in transactions", async () => {
    db.item.findFirst.mockResolvedValue({
      _count: {
        transactions: 0,
        purchaseInvoiceItems: 1,
        saleInvoiceItems: 0,
      },
    });

    const res = mockResponse();
    await controller.remove(mockRequest({ params: { id: 1 } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(runInTx).not.toHaveBeenCalled();
  });

  it("deletes an item nothing references", async () => {
    db.item.findFirst.mockResolvedValue({
      _count: {
        transactions: 0,
        purchaseInvoiceItems: 0,
        saleInvoiceItems: 0,
      },
    });
    db.item.delete.mockResolvedValue({ id: 1 });

    const res = mockResponse();
    await controller.remove(mockRequest({ params: { id: 1 } }), res);

    expect(db.item.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });
});

describe("itemController.quickPurchase", () => {
  const body = { quantity: 10, unit_price: 2000, note: null };

  beforeEach(() => {
    db.__tx.workspace.update.mockResolvedValue({ purchaseSeq: 1 });
    db.__tx.purchaseInvoice.create.mockResolvedValue({ id: 50 });
    db.__tx.item.findFirst.mockResolvedValue({
      id: 1,
      sellPrice: decimal(0),
      avgPurchasePrice: decimal(1000),
    });
    db.__tx.item.findFirstOrThrow.mockResolvedValue({
      currentStock: decimal(30),
    });
  });

  it("returns 404 for an item it cannot find in this workspace", async () => {
    db.__tx.item.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.quickPurchase(
      mockRequest({ params: { id: 9 }, body }),
      res,
    );

    expect(db.__tx.item.findFirst.mock.calls[0][0].where).toEqual({
      id: 9,
      workspaceId: WORKSPACE_ID,
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(applyMovements).not.toHaveBeenCalled();
  });

  it("brings the goods in at the price paid, against its invoice", async () => {
    await controller.quickPurchase(
      mockRequest({ params: { id: 1 }, body }, 3),
      mockResponse(),
    );

    expect(applyMovements.mock.calls[0][2]).toEqual({
      referenceType: "purchase_invoice",
      referenceId: 50,
      actorId: 3,
    });
    expect(applyMovements.mock.calls[0][3]).toEqual([
      {
        itemId: 1,
        warehouseId: MAIN_WAREHOUSE,
        quantity: 10,
        type: "purchase",
        unitCost: 2000,
        unitPrice: 2000,
        note: "خرید سریع",
      },
    ]);
  });

  it("writes a one-line, fully paid purchase invoice", async () => {
    await controller.quickPurchase(
      mockRequest({ params: { id: 1 }, body }, 3),
      mockResponse(),
    );

    expect(db.__tx.purchaseInvoice.create.mock.calls[0][0].data).toMatchObject({
      warehouseId: MAIN_WAREHOUSE,
      invoiceNumber: "PUR-0001",
      totalAmount: 20000,
      paidAmount: 20000,
      paymentStatus: "paid",
    });
    expect(
      db.__tx.purchaseInvoiceItem.create.mock.calls[0][0].data,
    ).toMatchObject({
      itemId: 1,
      quantity: 10,
      totalPrice: 20000,
    });
  });

  it("answers with the item's new total", async () => {
    const res = mockResponse();
    await controller.quickPurchase(
      mockRequest({ params: { id: 1 }, body }),
      res,
    );

    expect(res.json).toHaveBeenCalledWith({
      message: "خرید سریع با موفقیت ثبت شد",
      invoice_number: "PUR-0001",
      new_stock: 30,
    });
  });

  it("does everything inside one transaction", async () => {
    await controller.quickPurchase(
      mockRequest({ params: { id: 1 }, body }),
      mockResponse(),
    );

    expect(runInTx).toHaveBeenCalledWith(WORKSPACE_ID, expect.any(Function));
  });
});

describe("itemController.quickSale", () => {
  const body = { quantity: 4, customer_name: "رضا" };

  beforeEach(() => {
    db.__tx.workspace.update.mockResolvedValue({ saleSeq: 1 });
    db.__tx.saleInvoice.create.mockResolvedValue({ id: 60 });
    db.__tx.item.findFirst.mockResolvedValue({
      id: 1,
      sellPrice: decimal(1500),
      avgPurchasePrice: decimal(1000),
    });
    db.__tx.item.findFirstOrThrow.mockResolvedValue({
      currentStock: decimal(6),
    });
    applyMovements.mockResolvedValue([{ unitCost: 1000 }]);
  });

  it("refuses to sell more than is in stock, naming the item", async () => {
    applyMovements.mockRejectedValue(
      new InsufficientStockError(1, "خازن", 3, 4),
    );

    const res = mockResponse();
    await controller.quickSale(mockRequest({ params: { id: 1 }, body }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain("«خازن»");
    expect(db.__tx.saleInvoiceItem.create).not.toHaveBeenCalled();
  });

  it("sells at the item's sale price and keeps the cost it left at", async () => {
    await controller.quickSale(
      mockRequest({ params: { id: 1 }, body }),
      mockResponse(),
    );

    expect(db.__tx.saleInvoiceItem.create.mock.calls[0][0].data).toMatchObject({
      unitPrice: 1500,
      totalPrice: 6000,
      unitCost: 1000,
    });
    expect(db.__tx.saleInvoice.create.mock.calls[0][0].data).toMatchObject({
      customerName: "رضا",
      totalAmount: 6000,
      paidAmount: 6000,
    });
  });

  it("falls back to the average cost when no sale price is set", async () => {
    db.__tx.item.findFirst.mockResolvedValue({
      id: 1,
      sellPrice: decimal(0),
      avgPurchasePrice: decimal(1000),
    });

    await controller.quickSale(
      mockRequest({ params: { id: 1 }, body }),
      mockResponse(),
    );

    expect(db.__tx.saleInvoiceItem.create.mock.calls[0][0].data).toMatchObject({
      unitPrice: 1000,
      totalPrice: 4000,
    });
  });

  it("takes the goods off the shelf against its invoice", async () => {
    await controller.quickSale(
      mockRequest({ params: { id: 1 }, body }, 3),
      mockResponse(),
    );

    expect(applyMovements.mock.calls[0][2]).toEqual({
      referenceType: "sale_invoice",
      referenceId: 60,
      actorId: 3,
    });
    expect(applyMovements.mock.calls[0][3]).toEqual([
      {
        itemId: 1,
        warehouseId: MAIN_WAREHOUSE,
        quantity: -4,
        type: "sale",
        unitPrice: 1500,
        note: "فروش سریع",
      },
    ]);
  });

  it("answers with the item's new total, not one warehouse's", async () => {
    const res = mockResponse();
    await controller.quickSale(mockRequest({ params: { id: 1 }, body }), res);

    expect(res.json).toHaveBeenCalledWith({
      message: "فروش سریع با موفقیت ثبت شد",
      invoice_number: "SAL-0001",
      new_stock: 6,
    });
  });
});
