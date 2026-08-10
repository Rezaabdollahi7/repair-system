import { Request, Response } from "express";
import * as controller from "../controllers/itemController";
import prisma, { runInWorkspaceTransaction } from "../lib/prisma";

jest.mock("../lib/prisma", () => {
  const tx = {
    purchaseInvoice: { count: jest.fn(), create: jest.fn() },
    purchaseInvoiceItem: { create: jest.fn() },
    saleInvoice: { count: jest.fn(), create: jest.fn() },
    saleInvoiceItem: { create: jest.fn() },
    item: { findFirstOrThrow: jest.fn(), update: jest.fn() },
    inventoryTransaction: { create: jest.fn() },
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
  purchaseInvoice: Record<string, jest.Mock>;

  __tx: {
    purchaseInvoice: Record<string, jest.Mock>;
    purchaseInvoiceItem: Record<string, jest.Mock>;
    saleInvoice: Record<string, jest.Mock>;
    saleInvoiceItem: Record<string, jest.Mock>;
    item: Record<string, jest.Mock>;
    inventoryTransaction: Record<string, jest.Mock>;
  };
};

const runInTx = runInWorkspaceTransaction as unknown as jest.Mock;

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
    minStock: 5,
    currentStock: 20,
    avgPurchasePrice: decimal(1000),
    description: null,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    sellPrice: decimal(1500),
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
});

describe("itemController.getLowStock", () => {
  it("keeps only items at or below their minimum", async () => {
    db.item.findMany.mockResolvedValue([
      itemRow({ id: 1, currentStock: 20, minStock: 5 }),
      itemRow({ id: 2, currentStock: 3, minStock: 5 }),
      itemRow({ id: 3, currentStock: 5, minStock: 5 }),
    ]);

    const res = mockResponse();
    await controller.getLowStock(mockRequest(), res);

    expect(res.json.mock.calls[0][0].map((i: { id: number }) => i.id)).toEqual([
      2, 3,
    ]);
  });

  it("orders by how far below the minimum each item is", async () => {
    db.item.findMany.mockResolvedValue([
      itemRow({ id: 1, currentStock: 4, minStock: 5 }),
      itemRow({ id: 2, currentStock: 0, minStock: 10 }),
      itemRow({ id: 3, currentStock: 2, minStock: 5 }),
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
        quantity: 5,
        unitPrice: decimal(1000),
        referenceId: 7,
        referenceType: "purchase_invoice",
        note: null,
        createdBy: 1,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: 11,
        itemId: 1,
        type: "adjustment",
        quantity: -2,
        unitPrice: decimal(0),
        referenceId: null,
        referenceType: null,
        note: "اصلاح",
        createdBy: 1,
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
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
  };

  it("maps sell_price onto the sellPrice column", async () => {
    db.item.create.mockResolvedValue(itemRow());

    const res = mockResponse();
    await controller.create(mockRequest({ body }), res);

    expect(db.item.create.mock.calls[0][0].data).toMatchObject({
      workspaceId: WORKSPACE_ID,
      code: "C-100",
      sellPrice: 1500,
      categoryId: 2,
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("reports a duplicate code as 400", async () => {
    db.item.create.mockRejectedValue(duplicateError);

    const res = mockResponse();
    await controller.create(mockRequest({ body }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "این کد کالا قبلاً ثبت شده است",
    });
  });
});

describe("itemController.update", () => {
  it("leaves absent fields untouched", async () => {
    db.item.findFirst.mockResolvedValue({ id: 1 });
    db.item.update.mockResolvedValue(itemRow());

    await controller.update(
      mockRequest({ params: { id: 1 }, body: { minStock: 8 } }),
      mockResponse(),
    );

    expect(db.item.update.mock.calls[0][0].data).toEqual({ minStock: 8 });
  });

  it("disconnects the category when categoryId is null", async () => {
    db.item.findFirst.mockResolvedValue({ id: 1 });
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
    db.__tx.purchaseInvoice.count.mockResolvedValue(0);
    db.__tx.purchaseInvoice.create.mockResolvedValue({ id: 50 });
  });

  it("returns 404 for an unknown item", async () => {
    db.item.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.quickPurchase(
      mockRequest({ params: { id: 9 }, body }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(runInTx).not.toHaveBeenCalled();
  });

  it("recalculates the weighted average purchase price", async () => {
    // 20 units at 1000 plus 10 at 2000 = 40000 over 30 units.
    db.item.findFirst.mockResolvedValue({
      currentStock: 20,
      avgPurchasePrice: decimal(1000),
    });

    await controller.quickPurchase(
      mockRequest({ params: { id: 1 }, body }, 3),
      mockResponse(),
    );

    expect(db.__tx.item.update.mock.calls[0][0].data).toEqual({
      currentStock: 30,
      avgPurchasePrice: 40000 / 30,
    });
  });

  it("records the ledger entry against the invoice and the acting user", async () => {
    db.item.findFirst.mockResolvedValue({
      currentStock: 0,
      avgPurchasePrice: decimal(0),
    });

    await controller.quickPurchase(
      mockRequest({ params: { id: 1 }, body }, 3),
      mockResponse(),
    );

    expect(
      db.__tx.inventoryTransaction.create.mock.calls[0][0].data,
    ).toMatchObject({
      itemId: 1,
      type: "purchase",
      quantity: 10,
      referenceId: 50,
      referenceType: "purchase_invoice",
      createdBy: 3,
    });
  });

  it("does everything inside one transaction", async () => {
    db.item.findFirst.mockResolvedValue({
      currentStock: 0,
      avgPurchasePrice: decimal(0),
    });

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
    db.__tx.saleInvoice.count.mockResolvedValue(0);
    db.__tx.saleInvoice.create.mockResolvedValue({ id: 60 });
  });

  it("refuses to sell more than is in stock", async () => {
    db.item.findFirst.mockResolvedValue({
      currentStock: 3,
      sellPrice: decimal(1500),
      avgPurchasePrice: decimal(1000),
    });

    const res = mockResponse();
    await controller.quickSale(mockRequest({ params: { id: 1 }, body }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "موجودی کافی نیست. موجودی فعلی: 3",
    });
    expect(runInTx).not.toHaveBeenCalled();
  });

  it("sells at the item's sale price", async () => {
    db.item.findFirst.mockResolvedValue({
      currentStock: 10,
      sellPrice: decimal(1500),
      avgPurchasePrice: decimal(1000),
    });

    await controller.quickSale(
      mockRequest({ params: { id: 1 }, body }),
      mockResponse(),
    );

    expect(db.__tx.saleInvoiceItem.create.mock.calls[0][0].data).toMatchObject({
      unitPrice: 1500,
      totalPrice: 6000,
    });
  });

  it("falls back to the purchase price when no sale price is set", async () => {
    db.item.findFirst.mockResolvedValue({
      currentStock: 10,
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

  it("records the stock movement as a negative quantity", async () => {
    db.item.findFirst.mockResolvedValue({
      currentStock: 10,
      sellPrice: decimal(1500),
      avgPurchasePrice: decimal(1000),
    });

    await controller.quickSale(
      mockRequest({ params: { id: 1 }, body }, 3),
      mockResponse(),
    );

    expect(
      db.__tx.inventoryTransaction.create.mock.calls[0][0].data,
    ).toMatchObject({
      type: "sale",
      quantity: -4,
      referenceType: "sale_invoice",
      createdBy: 3,
    });
    expect(db.__tx.item.update.mock.calls[0][0].data).toEqual({
      currentStock: 6,
    });
  });
});
