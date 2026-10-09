import { Request, Response } from "express";
import prisma, { runInWorkspaceTransaction } from "../lib/prisma";
import type { Prisma, PurchaseInvoice } from "../generated/prisma/client";
import { ValidatedRequest } from "../middleware/validate";
import { AuthenticatedRequest } from "../types/request";
import { errorMessage } from "../utils/errors";
import { nextInvoiceNumber } from "../utils/invoiceNumber";
import { paymentStatusFor } from "../utils/payment";
import { lineTotals } from "../utils/invoiceTotals";
import {
  applyStockMovements,
  InsufficientStockError,
  StockError,
  type StockLine,
} from "../utils/stock";
import persianToEnglish from "../utils/persianToEnglish";
import type { IdParam } from "../schemas/common";
import type {
  PurchaseInvoiceCreateBody,
  PurchaseInvoiceListQuery,
  PurchaseInvoicePaymentBody,
  PurchaseInvoiceUpdateBody,
} from "../schemas/purchaseInvoice";
import { dateFilter } from "../utils/dateRange";
import { workspaceIdOf } from "../utils/workspace";
import { resolveWarehouseId } from "../utils/warehouse";

function toInvoiceResponse(invoice: PurchaseInvoice) {
  return {
    id: invoice.id,
    invoice_number: invoice.invoiceNumber,
    supplier_name: invoice.supplierName,
    warehouse_id: invoice.warehouseId,
    invoice_date: invoice.invoiceDate.toISOString(),
    total_amount: invoice.totalAmount.toNumber(),
    paid_amount: invoice.paidAmount.toNumber(),
    payment_status: invoice.paymentStatus,
    note: invoice.note,
    created_by: invoice.createdBy,
    created_at: invoice.createdAt.toISOString(),
    updated_at: invoice.updatedAt.toISOString(),
  };
}

interface LineInput {
  item_id: number;
  quantity: number;
  unit_price: number;
}

/** A line already on the invoice, as the stock reversal needs it. */
interface StoredLine {
  itemId: number;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
}

const REFERENCE_TYPE = "purchase_invoice";

/** A line's total in rials. Shared with the sale and repair forms, so a
 * fractional quantity rounds the same way everywhere. */
function lineTotal(line: LineInput): number {
  return lineTotals(line).totalPrice;
}

function invoiceTotal(lines: LineInput[]): number {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

/** The goods each line brings in, at the price paid — which is their cost. */
function purchaseMovements(
  lines: LineInput[],
  warehouseId: number,
  note: string,
): StockLine[] {
  return lines.map((line) => ({
    itemId: line.item_id,
    warehouseId,
    quantity: line.quantity,
    type: "purchase",
    unitCost: line.unit_price,
    unitPrice: line.unit_price,
    note,
  }));
}

/**
 * The invoice's existing lines taken back out — what delete does, and half
 * of what an edit does.
 *
 * Each leaves at the price it was bought at, not at the current average:
 * the only inverse that lands back on what the surviving stock cost
 * (utils/avgPurchasePrice.ts). And from the warehouse it went into, which an
 * edit may be about to change.
 */
function reversalMovements(
  lines: StoredLine[],
  warehouseId: number,
  note: string,
): StockLine[] {
  return lines.map((line) => ({
    itemId: line.itemId,
    warehouseId,
    quantity: -line.quantity.toNumber(),
    type: "reversal",
    unitCost: line.unitPrice.toNumber(),
    unitPrice: line.unitPrice.toNumber(),
    note,
  }));
}

async function writeLineRows(
  tx: Prisma.TransactionClient,
  invoiceId: number,
  lines: LineInput[],
  workspaceId: number,
): Promise<void> {
  await tx.purchaseInvoiceItem.createMany({
    data: lines.map((line) => ({
      workspaceId,
      invoiceId,
      itemId: line.item_id,
      quantity: line.quantity,
      unitPrice: line.unit_price,
      totalPrice: lineTotal(line),
    })),
  });
}

/**
 * The invoice and its lines, read under a row lock on the invoice.
 *
 * Inside the transaction rather than before it: two deletes of the same
 * invoice used to read it outside, both find it, and both put its goods
 * back. The lock makes the second wait, and then find nothing.
 */
async function lockInvoice(
  tx: Prisma.TransactionClient,
  id: number,
  workspaceId: number,
) {
  const locked = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM purchase_invoices
    WHERE id = ${id} AND workspace_id = ${workspaceId}
    FOR UPDATE
  `;
  if (locked.length === 0) return null;

  return tx.purchaseInvoice.findFirst({
    where: { id, workspaceId },
    include: {
      items: { select: { itemId: true, quantity: true, unitPrice: true } },
    },
  });
}

/**
 * The 400 for a stock refusal. Taking a purchase back out can only be
 * refused for one reason worth explaining — its goods have since been sold
 * or used — so that one is said in those words.
 */
function stockErrorMessage(error: StockError): string {
  if (error instanceof InsufficientStockError) {
    return (
      `از کالای «${error.itemName}» فقط ${error.available} در انبار مانده و ` +
      "بخشی از آنچه این فاکتور وارد کرده فروخته یا مصرف شده است. " +
      "تا آن فروش یا مصرف باشد، این فاکتور را نمی‌توان به این شکل تغییر داد."
    );
  }
  return error.message;
}

class InvoiceNotFound extends Error {}

// GET /api/purchase-invoices
export const getAll = async (req: Request, res: Response) => {
  try {
    const query = (req as ValidatedRequest).valid
      .query as PurchaseInvoiceListQuery;
    const { page, limit } = query;

    const where: Prisma.PurchaseInvoiceWhereInput = {
      workspaceId: workspaceIdOf(req),
    };

    if (query.supplier) {
      where.supplierName = {
        contains: persianToEnglish(query.supplier),
        mode: "insensitive",
      };
    }

    if (query.payment_status?.length) {
      where.paymentStatus = { in: query.payment_status };
    }

    const invoiceDate = dateFilter(query.from_date, query.to_date);
    if (invoiceDate) {
      where.invoiceDate = invoiceDate;
    }

    const [total, invoices] = await Promise.all([
      prisma.purchaseInvoice.count({ where }),
      prisma.purchaseInvoice.findMany({
        where,
        orderBy: { invoiceDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({
      data: invoices.map(toInvoiceResponse),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/purchase-invoices/:id
export const getById = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;

    // findFirst rather than findUnique: the id alone would resolve an
    // invoice belonging to another workspace.
    const invoice = await prisma.purchaseInvoice.findFirst({
      where: { id, workspaceId: workspaceIdOf(req) },
      include: {
        items: {
          orderBy: { id: "asc" },
          include: {
            item: { select: { code: true, name: true, unit: true } },
          },
        },
        warehouse: { select: { name: true } },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }

    res.json({
      ...toInvoiceResponse(invoice),
      warehouse_name: invoice.warehouse.name,
      items: invoice.items.map((line) => ({
        id: line.id,
        invoice_id: line.invoiceId,
        item_id: line.itemId,
        quantity: line.quantity.toNumber(),
        unit_price: line.unitPrice.toNumber(),
        total_price: line.totalPrice.toNumber(),
        created_at: line.createdAt.toISOString(),
        item_code: line.item.code,
        item_name: line.item.name,
        item_unit: line.item.unit,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// POST /api/purchase-invoices
export const create = async (req: Request, res: Response) => {
  try {
    const body = (req as ValidatedRequest).valid
      .body as PurchaseInvoiceCreateBody;
    const actorId = (req as AuthenticatedRequest).user?.id ?? null;
    // Read once, outside the transaction, and passed to every write inside
    // it: the request isn't available in there.
    const workspaceId = workspaceIdOf(req);

    const totalAmount = invoiceTotal(body.items);
    const paidAmount = body.paid_amount;

    // One transaction: the invoice, its lines and the stock they bring in
    // land together or not at all. An unknown item is refused by the stock
    // service inside it, and the rollback returns the invoice number too.
    const invoice = await runInWorkspaceTransaction(workspaceId, async (tx) => {
      const warehouseId = await resolveWarehouseId(
        tx,
        workspaceId,
        body.warehouse_id,
      );

      const created = await tx.purchaseInvoice.create({
        data: {
          workspaceId,
          invoiceNumber: await nextInvoiceNumber(tx, workspaceId, "purchase"),
          supplierName: body.supplier_name,
          warehouseId,
          invoiceDate: body.invoice_date ?? new Date(),
          totalAmount,
          paidAmount,
          paymentStatus: paymentStatusFor(paidAmount, totalAmount),
          note: body.note,
          createdBy: actorId,
        },
      });

      await writeLineRows(tx, created.id, body.items, workspaceId);

      await applyStockMovements(
        tx,
        workspaceId,
        {
          referenceType: REFERENCE_TYPE,
          referenceId: created.id,
          occurredAt: created.invoiceDate,
          actorId,
        },
        purchaseMovements(body.items, warehouseId, "خرید از فاکتور"),
      );

      return created;
    });

    res.status(201).json(toInvoiceResponse(invoice));
  } catch (error) {
    if (error instanceof StockError) {
      return res.status(400).json({ error: stockErrorMessage(error) });
    }
    res.status(500).json({ error: errorMessage(error) });
  }
};

// PUT /api/purchase-invoices/:id
export const update = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const body = valid.body as PurchaseInvoiceUpdateBody;
    const actorId = (req as AuthenticatedRequest).user?.id ?? null;
    const workspaceId = workspaceIdOf(req);

    const totalAmount = invoiceTotal(body.items);
    const note = "ویرایش فاکتور خرید";

    await runInWorkspaceTransaction(workspaceId, async (tx) => {
      const existing = await lockInvoice(tx, id, workspaceId);
      if (!existing) throw new InvoiceNotFound();

      // Omitted, the goods stay where they were received.
      const warehouseId =
        body.warehouse_id === null || body.warehouse_id === undefined
          ? existing.warehouseId
          : await resolveWarehouseId(tx, workspaceId, body.warehouse_id);

      await tx.purchaseInvoiceItem.deleteMany({ where: { invoiceId: id } });

      await tx.purchaseInvoice.update({
        where: { id },
        data: {
          supplierName: body.supplier_name,
          warehouseId,
          invoiceDate: body.invoice_date ?? new Date(),
          totalAmount,
          paidAmount: body.paid_amount,
          paymentStatus: paymentStatusFor(body.paid_amount, totalAmount),
          note: body.note,
        },
      });

      await writeLineRows(tx, id, body.items, workspaceId);

      // The new lines go in before the old ones come out. The result is the
      // same either way — the average lands on the same figure — but this
      // order does not refuse an edit that only raises a quantity: ten
      // bought, five sold since, edited to twelve. Taking the ten out first
      // would fall below zero on the way to a perfectly valid fifteen.
      // Both halves stay in the history, so the shop can see the invoice was
      // edited rather than finding the purchase silently rewritten.
      await applyStockMovements(
        tx,
        workspaceId,
        {
          referenceType: REFERENCE_TYPE,
          referenceId: id,
          occurredAt: body.invoice_date ?? new Date(),
          actorId,
        },
        [
          ...purchaseMovements(body.items, warehouseId, note),
          ...reversalMovements(existing.items, existing.warehouseId, note),
        ],
      );
    });

    res.json({ message: "فاکتور با موفقیت ویرایش شد" });
  } catch (error) {
    if (error instanceof InvoiceNotFound) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }
    if (error instanceof StockError) {
      return res.status(400).json({ error: stockErrorMessage(error) });
    }
    res.status(500).json({ error: errorMessage(error) });
  }
};

// PUT /api/purchase-invoices/:id/payment
export const updatePayment = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const { paid_amount } = valid.body as PurchaseInvoicePaymentBody;

    const invoice = await prisma.purchaseInvoice.findFirst({
      where: { id, workspaceId: workspaceIdOf(req) },
      select: { totalAmount: true },
    });

    if (!invoice) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }

    const paymentStatus = paymentStatusFor(
      paid_amount,
      invoice.totalAmount.toNumber(),
    );

    await prisma.purchaseInvoice.update({
      where: { id },
      data: { paidAmount: paid_amount, paymentStatus },
    });

    res.json({
      message: "وضعیت پرداخت بروز شد",
      payment_status: paymentStatus,
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// DELETE /api/purchase-invoices/:id
export const remove = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;
    const actorId = (req as AuthenticatedRequest).user?.id ?? null;
    const workspaceId = workspaceIdOf(req);

    await runInWorkspaceTransaction(workspaceId, async (tx) => {
      // Looks up the invoice itself, not its lines: an invoice with no lines
      // is still an invoice, and used to be impossible to delete.
      const invoice = await lockInvoice(tx, id, workspaceId);
      if (!invoice) throw new InvoiceNotFound();

      await applyStockMovements(
        tx,
        workspaceId,
        {
          referenceType: REFERENCE_TYPE,
          referenceId: id,
          actorId,
        },
        reversalMovements(
          invoice.items,
          invoice.warehouseId,
          "حذف فاکتور خرید",
        ),
      );

      // The lines go with it via onDelete: Cascade.
      await tx.purchaseInvoice.delete({ where: { id } });
    });

    res.json({ message: "فاکتور و تراکنش‌های مربوطه حذف شدند" });
  } catch (error) {
    if (error instanceof InvoiceNotFound) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }
    if (error instanceof StockError) {
      return res.status(400).json({ error: stockErrorMessage(error) });
    }
    res.status(500).json({ error: errorMessage(error) });
  }
};
