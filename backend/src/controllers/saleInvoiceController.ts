import { Request, Response } from "express";
import prisma, { runInWorkspaceTransaction } from "../lib/prisma";
import type { Prisma, SaleInvoice } from "../generated/prisma/client";
import { ValidatedRequest } from "../middleware/validate";
import { AuthenticatedRequest } from "../types/request";
import { errorMessage } from "../utils/errors";
import { nextInvoiceNumber } from "../utils/invoiceNumber";
import { paymentStatusFor } from "../utils/payment";
import persianToEnglish from "../utils/persianToEnglish";
import type { IdParam } from "../schemas/common";
import type {
  SaleInvoiceCreateBody,
  SaleInvoiceListQuery,
  SaleInvoicePaymentBody,
  SaleInvoiceUpdateBody,
} from "../schemas/saleInvoice";
import { dateFilter } from "../utils/dateRange";
import { workspaceIdOf } from "../utils/workspace";

const deviceSelect = {
  device: {
    select: {
      deviceName: true,
      brand: true,
      model: true,
      serialNumber: true,
    },
  },
} satisfies Prisma.SaleInvoiceInclude;

type InvoiceWithDevice = SaleInvoice & {
  device?: {
    deviceName: string;
    brand: string | null;
    model: string | null;
    serialNumber: string | null;
  } | null;
};

/**
 * Device details are spread onto the invoice itself rather than nested, which
 * is the shape the frontend already reads. serial_number is included only on
 * the single-invoice endpoint, matching the old behaviour.
 */
function toInvoiceResponse(
  invoice: InvoiceWithDevice,
  options: { includeSerial?: boolean } = {},
) {
  const base = {
    id: invoice.id,
    invoice_number: invoice.invoiceNumber,
    customer_id: invoice.customerId,
    customer_name: invoice.customerName,
    customer_phone: invoice.customerPhone,
    invoice_date: invoice.invoiceDate.toISOString(),
    total_amount: invoice.totalAmount.toNumber(),
    paid_amount: invoice.paidAmount.toNumber(),
    payment_status: invoice.paymentStatus,
    note: invoice.note,
    created_by: invoice.createdBy,
    created_at: invoice.createdAt.toISOString(),
    updated_at: invoice.updatedAt.toISOString(),
    device_id: invoice.deviceId,
  };

  if (!invoice.device) return base;

  return {
    ...base,
    device_name: invoice.device.deviceName,
    brand: invoice.device.brand,
    model: invoice.device.model,
    ...(options.includeSerial
      ? { serial_number: invoice.device.serialNumber }
      : {}),
  };
}

// GET /api/sale-invoices
export const getAll = async (req: Request, res: Response) => {
  try {
    const query = (req as ValidatedRequest).valid.query as SaleInvoiceListQuery;
    const { page, limit } = query;

    const where: Prisma.SaleInvoiceWhereInput = {
      workspaceId: workspaceIdOf(req),
    };

    if (query.search) {
      const term = persianToEnglish(query.search);
      where.OR = [
        { customerName: { contains: term, mode: "insensitive" } },
        { customerPhone: { contains: term, mode: "insensitive" } },
        { invoiceNumber: { contains: term, mode: "insensitive" } },
      ];
    }

    if (query.payment_status?.length) {
      where.paymentStatus = { in: query.payment_status };
    }

    const invoiceDate = dateFilter(query.date_from, query.date_to);
    if (invoiceDate) {
      where.invoiceDate = invoiceDate;
    }

    if (query.amount_from !== undefined || query.amount_to !== undefined) {
      where.totalAmount = {
        ...(query.amount_from !== undefined ? { gte: query.amount_from } : {}),
        ...(query.amount_to !== undefined ? { lte: query.amount_to } : {}),
      };
    }

    // include rather than a device lookup per row: the old handler queried
    // the devices table once for every invoice on the page.
    const [total, invoices] = await Promise.all([
      prisma.saleInvoice.count({ where }),
      prisma.saleInvoice.findMany({
        where,
        orderBy: { invoiceDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: deviceSelect,
      }),
    ]);

    res.json({
      data: invoices.map((invoice) => toInvoiceResponse(invoice)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/sale-invoices/:id
export const getById = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;

    // findFirst rather than findUnique: the id alone would resolve an
    // invoice belonging to another workspace.
    const invoice = await prisma.saleInvoice.findFirst({
      where: { id, workspaceId: workspaceIdOf(req) },
      include: {
        ...deviceSelect,
        items: {
          orderBy: { id: "asc" },
          include: {
            item: {
              select: {
                code: true,
                name: true,
                unit: true,
                currentStock: true,
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }

    res.json({
      ...toInvoiceResponse(invoice, { includeSerial: true }),
      items: invoice.items.map((line) => ({
        id: line.id,
        invoice_id: line.invoiceId,
        item_id: line.itemId,
        quantity: line.quantity,
        unit_price: line.unitPrice.toNumber(),
        total_price: line.totalPrice.toNumber(),
        created_at: line.createdAt.toISOString(),
        item_code: line.item?.code ?? null,
        // The catalogue name wins over the copy stored on the line, matching
        // the old COALESCE(i.name, sii.name).
        item_name: line.item?.name ?? line.name,
        item_unit: line.item?.unit ?? line.unit,
        current_stock: line.item?.currentStock ?? null,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

interface LineInput {
  item_type?: string;
  item_id?: number | null;
  name: string | null;
  unit: string | null;
  quantity: number;
  unit_price: number;
}

function isInventoryLine(line: LineInput): line is LineInput & {
  item_id: number;
} {
  return line.item_type === "inventory" && Boolean(line.item_id);
}

/**
 * Confirms every inventory line has enough stock, naming the first item that
 * doesn't. Runs inside the caller's transaction so the figures it reads are
 * the ones the write will act on.
 */
async function assertStockAvailable(
  tx: Prisma.TransactionClient,
  lines: LineInput[],
  workspaceId: number,
): Promise<string | null> {
  for (const line of lines) {
    if (!isInventoryLine(line)) continue;

    // Scoped, so an item id from another workspace reads as missing rather
    // than lending its stock to this invoice.
    const item = await tx.item.findFirst({
      where: { id: line.item_id, workspaceId },
      select: { name: true, currentStock: true },
    });

    if (!item) {
      return `کالا با شناسه ${line.item_id} یافت نشد`;
    }

    if (item.currentStock < line.quantity) {
      return `موجودی کالای "${item.name}" کافی نیست. موجودی فعلی: ${item.currentStock}`;
    }
  }

  return null;
}

/**
 * Writes the invoice's lines, decrementing stock and recording a ledger entry
 * for each inventory line. Custom lines are stored but leave stock alone.
 */
async function writeLines(
  tx: Prisma.TransactionClient,
  invoiceId: number,
  lines: LineInput[],
  actorId: number | null,
  workspaceId: number,
): Promise<void> {
  for (const line of lines) {
    const totalPrice = line.quantity * line.unit_price;
    const inventory = isInventoryLine(line);

    await tx.saleInvoiceItem.create({
      data: {
        workspaceId,
        invoiceId,
        itemId: inventory ? line.item_id : null,
        quantity: line.quantity,
        unitPrice: line.unit_price,
        totalPrice,
        name: inventory ? line.name : (line.name ?? "آیتم دلخواه"),
        unit: inventory ? line.unit : (line.unit ?? "عدد"),
      },
    });

    if (!inventory) continue;

    const item = await tx.item.findFirstOrThrow({
      where: { id: line.item_id, workspaceId },
      select: { currentStock: true },
    });

    await tx.item.update({
      where: { id: line.item_id },
      data: { currentStock: Math.max(0, item.currentStock - line.quantity) },
    });

    await tx.inventoryTransaction.create({
      data: {
        workspaceId,
        itemId: line.item_id,
        type: "sale",
        quantity: -line.quantity,
        unitPrice: line.unit_price,
        // The old code passed null here while setting referenceType, so sales
        // made through a full invoice never showed their invoice number in an
        // item's stock history.
        referenceId: invoiceId,
        referenceType: "sale_invoice",
        note: "فروش از فاکتور",
        createdBy: actorId,
      },
    });
  }
}

/**
 * Puts back the stock an invoice's existing lines took, before those lines
 * are replaced or the invoice is removed.
 */
async function returnLinesToStock(
  tx: Prisma.TransactionClient,
  invoiceId: number,
  lines: { itemId: number | null; quantity: number }[],
  note: string,
  actorId: number | null,
  workspaceId: number,
): Promise<void> {
  for (const line of lines) {
    if (line.itemId === null) continue;

    const item = await tx.item.findFirstOrThrow({
      where: { id: line.itemId, workspaceId },
      select: { currentStock: true },
    });

    await tx.item.update({
      where: { id: line.itemId },
      data: { currentStock: item.currentStock + line.quantity },
    });

    await tx.inventoryTransaction.create({
      data: {
        workspaceId,
        itemId: line.itemId,
        type: "adjustment",
        quantity: line.quantity,
        referenceId: invoiceId,
        referenceType: "sale_invoice",
        note,
        createdBy: actorId,
      },
    });
  }
}

// POST /api/sale-invoices
export const create = async (req: Request, res: Response) => {
  try {
    const body = (req as ValidatedRequest).valid.body as SaleInvoiceCreateBody;
    const actorId = (req as AuthenticatedRequest).user?.id ?? null;
    // Read once, outside the transaction, and passed to every write inside
    // it: the request isn't available in there.
    const workspaceId = workspaceIdOf(req);

    const lines = body.items as LineInput[];
    const totalAmount = lines.reduce(
      (sum, line) => sum + line.quantity * line.unit_price,
      0,
    );

    const result = await runInWorkspaceTransaction(workspaceId, async (tx) => {
      const stockError = await assertStockAvailable(tx, lines, workspaceId);
      if (stockError) return { error: stockError };

      const invoice = await tx.saleInvoice.create({
        data: {
          workspaceId,
          invoiceNumber: await nextInvoiceNumber(tx, workspaceId, "sale"),
          customerId: body.customer_id ?? null,
          customerName: body.customer_name,
          customerPhone: body.customer_phone,
          deviceId: body.device_id ?? null,
          invoiceDate: body.invoice_date ?? new Date(),
          totalAmount,
          paidAmount: body.paid_amount,
          paymentStatus: paymentStatusFor(body.paid_amount, totalAmount),
          note: body.note,
          createdBy: actorId,
        },
      });

      await writeLines(tx, invoice.id, lines, actorId, workspaceId);

      return { invoice };
    });

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    const invoice = result.invoice!;
    res.status(201).json({
      id: invoice.id,
      invoice_number: invoice.invoiceNumber,
      total_amount: invoice.totalAmount.toNumber(),
      payment_status: invoice.paymentStatus,
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// PUT /api/sale-invoices/:id
export const update = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const body = valid.body as SaleInvoiceUpdateBody;
    const actorId = (req as AuthenticatedRequest).user?.id ?? null;
    const workspaceId = workspaceIdOf(req);

    const existing = await prisma.saleInvoice.findFirst({
      where: { id, workspaceId },
      include: { items: { select: { itemId: true, quantity: true } } },
    });

    if (!existing) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }

    const lines = body.items as LineInput[];
    const totalAmount = lines.reduce(
      (sum, line) => sum + line.quantity * line.unit_price,
      0,
    );

    await runInWorkspaceTransaction(workspaceId, async (tx) => {
      // Old stock goes back first so an edit that raises a quantity can draw
      // on what this same invoice was already holding. Inside the transaction
      // now: the old code wrote this back before validating the new lines, so
      // a rejected edit permanently inflated stock with nothing to undo it.
      await returnLinesToStock(
        tx,
        id,
        existing.items,
        "ویرایش فاکتور فروش",
        actorId,
        workspaceId,
      );

      const stockError = await assertStockAvailable(tx, lines, workspaceId);
      if (stockError) {
        // Unwinds every write above, including the stock that was put back.
        throw new StockError(stockError);
      }

      await tx.saleInvoiceItem.deleteMany({ where: { invoiceId: id } });

      await tx.saleInvoice.update({
        where: { id },
        data: {
          customerId: body.customer_id ?? null,
          customerName: body.customer_name,
          customerPhone: body.customer_phone,
          deviceId: body.device_id ?? null,
          invoiceDate: body.invoice_date ?? new Date(),
          totalAmount,
          paidAmount: body.paid_amount,
          paymentStatus: paymentStatusFor(body.paid_amount, totalAmount),
          note: body.note,
        },
      });

      await writeLines(tx, id, lines, actorId, workspaceId);
    });

    res.json({ message: "فاکتور با موفقیت ویرایش شد" });
  } catch (error) {
    if (error instanceof StockError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: errorMessage(error) });
  }
};

/**
 * Thrown to roll the update transaction back on a stock problem. A plain
 * return can't be used there: the writes that put the old stock back have to
 * be undone, and only a throw does that.
 */
class StockError extends Error {}

// PUT /api/sale-invoices/:id/payment
export const updatePayment = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const { paid_amount } = valid.body as SaleInvoicePaymentBody;

    const invoice = await prisma.saleInvoice.findFirst({
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

    await prisma.saleInvoice.update({
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

// DELETE /api/sale-invoices/:id
export const remove = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;
    const actorId = (req as AuthenticatedRequest).user?.id ?? null;
    const workspaceId = workspaceIdOf(req);

    // Looks up the invoice, not its lines: the old code read the lines and
    // treated an empty result as "not found", so an invoice with no lines
    // could never be deleted.
    const invoice = await prisma.saleInvoice.findFirst({
      where: { id, workspaceId },
      include: { items: { select: { itemId: true, quantity: true } } },
    });

    if (!invoice) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }

    await runInWorkspaceTransaction(workspaceId, async (tx) => {
      await returnLinesToStock(
        tx,
        id,
        invoice.items,
        "ابطال فاکتور فروش",
        actorId,
        workspaceId,
      );

      // The lines go with it via onDelete: Cascade.
      await tx.saleInvoice.delete({ where: { id } });
    });

    res.json({ message: "فاکتور فروش حذف و موجودی کالاها بازگردانده شد" });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};
