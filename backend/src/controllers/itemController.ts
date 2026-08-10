import { Request, Response } from "express";
import prisma, { runInWorkspaceTransaction } from "../lib/prisma";
import type { Prisma } from "../generated/prisma/client";
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
  ItemTransactionsQuery,
  ItemUpdateBody,
  QuickPurchaseBody,
  QuickSaleBody,
} from "../schemas/item";
import { nextInvoiceNumber } from "../utils/invoiceNumber";
import { workspaceIdOf } from "../utils/workspace";

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
    minStock: item.minStock,
    currentStock: item.currentStock,
    avgPurchasePrice: item.avgPurchasePrice.toNumber(),
    description: item.description,
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    sellPrice: item.sellPrice.toNumber(),
    categoryName: item.category?.name ?? null,
  };
}

const DUPLICATE_CODE = { error: "این کد کالا قبلاً ثبت شده است" };

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
    const { categoryId, page, limit } = (req as ValidatedRequest).valid
      .query as ItemListQuery;

    const where: Prisma.ItemWhereInput = { workspaceId: workspaceIdOf(req) };
    if (categoryId !== undefined) {
      where.categoryId = categoryId;
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
      include: itemInclude,
    });

    if (!item) {
      return res.status(404).json({ error: "کالا یافت نشد" });
    }

    res.json(toItemResponse(item));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/items/search
export const search = async (req: Request, res: Response) => {
  try {
    const { q, categoryId, page, limit } = (req as ValidatedRequest).valid
      .query as ItemSearchQuery;

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
      .filter((item) => item.currentStock <= item.minStock)
      .sort(
        (a, b) => b.minStock - b.currentStock - (a.minStock - a.currentStock),
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
        current_stock: item.currentStock,
        avg_purchase_price: item.avgPurchasePrice.toNumber(),
        sell_price: item.sellPrice.toNumber(),
        category_name: item.category?.name ?? null,
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
      quantity: tx.quantity,
      unit_price: tx.unitPrice.toNumber(),
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

// POST /api/items
export const create = async (req: Request, res: Response) => {
  try {
    const body = (req as ValidatedRequest).valid.body as ItemCreateBody;

    const item = await prisma.item.create({
      data: {
        workspaceId: workspaceIdOf(req),
        code: body.code,
        name: body.name,
        unit: body.unit,
        categoryId: body.categoryId ?? null,
        minStock: body.minStock,
        description: body.description,
        sellPrice: body.sell_price,
      },
      include: itemInclude,
    });

    res.status(201).json(toItemResponse(item));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(400).json(DUPLICATE_CODE);
    }
    res.status(500).json({ error: errorMessage(error) });
  }
};

// PUT /api/items/:id
export const update = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const body = valid.body as ItemUpdateBody;

    const existing = await prisma.item.findFirst({
      where: { id, workspaceId: workspaceIdOf(req) },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "کالا یافت نشد" });
    }

    const data: Prisma.ItemUpdateInput = {};
    if (body.code !== undefined) data.code = body.code;
    if (body.name !== undefined) data.name = body.name;
    if (body.unit !== undefined) data.unit = body.unit;
    if (body.minStock !== undefined) data.minStock = body.minStock;
    if (body.description !== undefined) data.description = body.description;
    if (body.sell_price !== undefined) data.sellPrice = body.sell_price;
    if (body.categoryId !== undefined) {
      data.category =
        body.categoryId === null
          ? { disconnect: true }
          : { connect: { id: body.categoryId } };
    }

    const item = await prisma.item.update({
      where: { id },
      data,
      include: itemInclude,
    });

    res.json(toItemResponse(item));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(400).json(DUPLICATE_CODE);
    }
    res.status(500).json({ error: errorMessage(error) });
  }
};

// DELETE /api/items/:id
export const remove = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;

    const item = await prisma.item.findFirst({
      where: { id, workspaceId: workspaceIdOf(req) },
      select: {
        _count: {
          select: {
            transactions: true,
            purchaseInvoiceItems: true,
            saleInvoiceItems: true,
          },
        },
      },
    });

    if (!item) {
      return res.status(404).json({ error: "کالا یافت نشد" });
    }

    // The old check only counted transactions. Invoice lines are counted too
    // because the schema restricts those relations, so deleting an item that
    // appears on an invoice would otherwise fail as a constraint error rather
    // than an explanation.
    const references =
      item._count.transactions +
      item._count.purchaseInvoiceItems +
      item._count.saleInvoiceItems;

    if (references > 0) {
      return res.status(400).json({
        error: "این کالا در تراکنش‌ها استفاده شده و قابل حذف نیست",
      });
    }

    await prisma.item.delete({ where: { id } });

    res.json({ message: "کالا با موفقیت حذف شد" });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

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

    const item = await prisma.item.findFirst({
      where: { id, workspaceId },
      select: { currentStock: true, avgPurchasePrice: true },
    });
    if (!item) {
      return res.status(404).json({ error: "کالا یافت نشد" });
    }

    const totalAmount = body.quantity * body.unit_price;
    const newStock = item.currentStock + body.quantity;

    // Weighted average: existing stock valued at the old average, plus this
    // purchase at its own price, spread over the new total.
    const currentValue = item.avgPurchasePrice.toNumber() * item.currentStock;
    const newAvgPrice = (currentValue + totalAmount) / newStock;

    // One transaction: the invoice, its line, the stock adjustment and the
    // ledger entry have to land together or not at all, or stock and history
    // drift apart.
    const invoiceNumber = await runInWorkspaceTransaction(
      workspaceId,
      async (tx) => {
        const number = await nextInvoiceNumber(tx, workspaceId, "purchase");
        const invoice = await tx.purchaseInvoice.create({
          data: {
            workspaceId,
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

        await tx.item.update({
          where: { id },
          data: { currentStock: newStock, avgPurchasePrice: newAvgPrice },
        });

        await tx.inventoryTransaction.create({
          data: {
            workspaceId,
            itemId: id,
            type: "purchase",
            quantity: body.quantity,
            unitPrice: body.unit_price,
            referenceId: invoice.id,
            referenceType: "purchase_invoice",
            note: "خرید سریع",
            createdBy: actorId,
          },
        });

        return number;
      },
    );

    res.json({
      message: "خرید سریع با موفقیت ثبت شد",
      invoice_number: invoiceNumber,
      new_stock: newStock,
    });
  } catch (error) {
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

    const item = await prisma.item.findFirst({
      where: { id, workspaceId },
      select: { currentStock: true, sellPrice: true, avgPurchasePrice: true },
    });
    if (!item) {
      return res.status(404).json({ error: "کالا یافت نشد" });
    }

    if (item.currentStock < body.quantity) {
      return res.status(400).json({
        error: `موجودی کافی نیست. موجودی فعلی: ${item.currentStock}`,
      });
    }

    // Sells at the item's sale price, falling back to the average purchase
    // price when no sale price has been set. The old code always used the
    // purchase price, which recorded every quick sale at cost and left the
    // profit report showing a zero margin for them.
    const sellPrice = item.sellPrice.toNumber();
    const unitPrice =
      sellPrice > 0 ? sellPrice : item.avgPurchasePrice.toNumber();

    const totalAmount = body.quantity * unitPrice;
    const newStock = item.currentStock - body.quantity;

    const invoiceNumber = await runInWorkspaceTransaction(
      workspaceId,
      async (tx) => {
        const number = await nextInvoiceNumber(tx, workspaceId, "sale");
        const invoice = await tx.saleInvoice.create({
          data: {
            workspaceId,
            invoiceNumber: number,
            customerName: body.customer_name ?? "فروش سریع",
            totalAmount,
            paidAmount: totalAmount,
            paymentStatus: "paid",
            note: "فروش سریع از صفحه جزئیات کالا",
            createdBy: actorId,
          },
        });

        await tx.saleInvoiceItem.create({
          data: {
            workspaceId,
            invoiceId: invoice.id,
            itemId: id,
            quantity: body.quantity,
            unitPrice,
            totalPrice: totalAmount,
          },
        });

        await tx.item.update({
          where: { id },
          data: { currentStock: newStock },
        });

        await tx.inventoryTransaction.create({
          data: {
            workspaceId,
            itemId: id,
            type: "sale",
            // Negative, matching how the ledger records outgoing stock.
            quantity: -body.quantity,
            unitPrice,
            referenceId: invoice.id,
            referenceType: "sale_invoice",
            note: "فروش سریع",
            createdBy: actorId,
          },
        });

        return number;
      },
    );

    res.json({
      message: "فروش سریع با موفقیت ثبت شد",
      invoice_number: invoiceNumber,
      new_stock: newStock,
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};
