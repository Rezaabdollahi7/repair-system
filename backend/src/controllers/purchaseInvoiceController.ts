import { Request, Response } from "express";
import prisma from "../lib/prisma";
import type { Prisma, PurchaseInvoice } from "../generated/prisma/client";
import { ValidatedRequest } from "../middleware/validate";
import { AuthenticatedRequest } from "../types/request";
import { errorMessage } from "../utils/errors";
import { buildInvoiceNumber, todayRange } from "../utils/invoiceNumber";
import { paymentStatusFor } from "../utils/payment";
import persianToEnglish from "../utils/persianToEnglish";
import type { IdParam } from "../schemas/common";
import type {
  PurchaseInvoiceCreateBody,
  PurchaseInvoiceListQuery,
  PurchaseInvoicePaymentBody,
} from "../schemas/purchaseInvoice";
import { dateFilter } from "../utils/dateRange";

function toInvoiceResponse(invoice: PurchaseInvoice) {
  return {
    id: invoice.id,
    invoice_number: invoice.invoiceNumber,
    supplier_name: invoice.supplierName,
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

// GET /api/purchase-invoices
export const getAll = async (req: Request, res: Response) => {
  try {
    const query = (req as ValidatedRequest).valid
      .query as PurchaseInvoiceListQuery;
    const { page, limit } = query;

    const where: Prisma.PurchaseInvoiceWhereInput = {};

    if (query.supplier) {
      where.supplierName = {
        contains: persianToEnglish(query.supplier),
        mode: "insensitive",
      };
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

    const invoice = await prisma.purchaseInvoice.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { id: "asc" },
          include: {
            item: { select: { code: true, name: true, unit: true } },
          },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }

    res.json({
      ...toInvoiceResponse(invoice),
      items: invoice.items.map((line) => ({
        id: line.id,
        invoice_id: line.invoiceId,
        item_id: line.itemId,
        quantity: line.quantity,
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

    // Checked up front, outside the transaction, so an unknown id is reported
    // by its own number rather than surfacing as a foreign-key error.
    const itemIds = [...new Set(body.items.map((line) => line.item_id))];
    const existing = await prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((item) => item.id));
    const missing = itemIds.find((id) => !existingIds.has(id));

    if (missing !== undefined) {
      return res
        .status(400)
        .json({ error: `کالا با شناسه ${missing} یافت نشد` });
    }

    const totalAmount = body.items.reduce(
      (sum, line) => sum + line.quantity * line.unit_price,
      0,
    );
    const paidAmount = body.paid_amount;

    // One transaction: the invoice, its lines, every stock adjustment and
    // every ledger entry have to land together, or stock and history drift
    // apart.
    const invoice = await prisma.$transaction(async (tx) => {
      const todayCount = await tx.purchaseInvoice.count({
        where: { invoiceDate: todayRange() },
      });

      const created = await tx.purchaseInvoice.create({
        data: {
          invoiceNumber: buildInvoiceNumber("PUR", todayCount),
          supplierName: body.supplier_name,
          invoiceDate: body.invoice_date ?? new Date(),
          totalAmount,
          paidAmount,
          paymentStatus: paymentStatusFor(paidAmount, totalAmount),
          note: body.note,
          createdBy: actorId,
        },
      });

      for (const line of body.items) {
        const totalPrice = line.quantity * line.unit_price;

        await tx.purchaseInvoiceItem.create({
          data: {
            invoiceId: created.id,
            itemId: line.item_id,
            quantity: line.quantity,
            unitPrice: line.unit_price,
            totalPrice,
          },
        });

        // Re-read inside the loop rather than from a bulk fetch: an invoice
        // may list the same item twice, and each line has to build on the
        // stock the previous one left behind.
        const item = await tx.item.findUniqueOrThrow({
          where: { id: line.item_id },
          select: { currentStock: true, avgPurchasePrice: true },
        });

        const newStock = item.currentStock + line.quantity;
        const currentValue =
          item.avgPurchasePrice.toNumber() * item.currentStock;
        const newAvgPrice =
          newStock > 0
            ? (currentValue + totalPrice) / newStock
            : line.unit_price;

        await tx.item.update({
          where: { id: line.item_id },
          data: { currentStock: newStock, avgPurchasePrice: newAvgPrice },
        });

        await tx.inventoryTransaction.create({
          data: {
            itemId: line.item_id,
            type: "purchase",
            quantity: line.quantity,
            unitPrice: line.unit_price,
            // The old code passed null here while still setting
            // referenceType, so purchases made through a full invoice never
            // showed their invoice number in an item's stock history.
            referenceId: created.id,
            referenceType: "purchase_invoice",
            note: "خرید از فاکتور",
            createdBy: actorId,
          },
        });
      }

      return created;
    });

    res.status(201).json(toInvoiceResponse(invoice));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// PUT /api/purchase-invoices/:id/payment
export const updatePayment = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const { paid_amount } = valid.body as PurchaseInvoicePaymentBody;

    const invoice = await prisma.purchaseInvoice.findUnique({
      where: { id },
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

    // Looks up the invoice itself, not its lines. The old code read the lines
    // and treated an empty result as "not found", which made an invoice with
    // no lines impossible to delete.
    const invoice = await prisma.purchaseInvoice.findUnique({
      where: { id },
      include: {
        items: { select: { itemId: true, quantity: true } },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }

    await prisma.$transaction(async (tx) => {
      for (const line of invoice.items) {
        const item = await tx.item.findUniqueOrThrow({
          where: { id: line.itemId },
          select: { currentStock: true },
        });

        await tx.item.update({
          where: { id: line.itemId },
          // Clamped at zero, as before: the stock may already have been sold
          // on, and a negative figure would be worse than an inexact one.
          data: {
            currentStock: Math.max(0, item.currentStock - line.quantity),
          },
        });

        await tx.inventoryTransaction.create({
          data: {
            itemId: line.itemId,
            type: "adjustment",
            quantity: -line.quantity,
            referenceId: id,
            referenceType: "purchase_invoice",
            note: "حذف فاکتور خرید",
            createdBy: actorId,
          },
        });
      }

      // The lines go with it via onDelete: Cascade.
      await tx.purchaseInvoice.delete({ where: { id } });
    });

    res.json({ message: "فاکتور و تراکنش‌های مربوطه حذف شدند" });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};
