import { Request, Response } from "express";
import prisma, { runInWorkspaceTransaction } from "../lib/prisma";
import type { Prisma, SaleInvoice } from "../generated/prisma/client";
import { ValidatedRequest } from "../middleware/validate";
import { AuthenticatedRequest } from "../types/request";
import { errorMessage } from "../utils/errors";
import { nextInvoiceNumber } from "../utils/invoiceNumber";
import { paymentStatusFor } from "../utils/payment";
import { lineTotals } from "../utils/invoiceTotals";
import {
  applyStockMovements,
  StockError,
  type StockLine,
} from "../utils/stock";
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
import { resolveWarehouseId } from "../utils/warehouse";

const deviceSelect = {
  device: {
    select: {
      deviceName: true,
      brand: true,
      model: true,
      serialNumber: true,
      receptionNumber: true,
    },
  },
} satisfies Prisma.SaleInvoiceInclude;

/**
 * Derived from deviceSelect rather than written out, so adding a column to
 * that select is enough — a hand-written copy went out of date the first
 * time one was, and the error pointed at the mapper rather than at the shape
 * that had drifted.
 */
type InvoiceWithDevice = SaleInvoice &
  Partial<Prisma.SaleInvoiceGetPayload<{ include: typeof deviceSelect }>>;

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
    warehouse_id: invoice.warehouseId,
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
    reception_number: invoice.device.receptionNumber,
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
        quantity: line.quantity.toNumber(),
        unit_price: line.unitPrice.toNumber(),
        total_price: line.totalPrice.toNumber(),
        created_at: line.createdAt.toISOString(),
        item_code: line.item?.code ?? null,
        // The catalogue name wins over the copy stored on the line, matching
        // the old COALESCE(i.name, sii.name).
        item_name: line.item?.name ?? line.name,
        item_unit: line.item?.unit ?? line.unit,
        current_stock: line.item?.currentStock.toNumber() ?? null,
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

/** A line already on the invoice, as the stock reversal needs it. */
interface StoredLine {
  itemId: number | null;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal | null;
}

const REFERENCE_TYPE = "sale_invoice";

function isInventoryLine(line: LineInput): line is LineInput & {
  item_id: number;
} {
  return line.item_type === "inventory" && Boolean(line.item_id);
}

/** A line's total in rials, rounded the same way on every invoice. */
function lineTotal(line: LineInput): number {
  return lineTotals(line).totalPrice;
}

function invoiceTotal(lines: LineInput[]): number {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

/** The goods the inventory lines take off the shelf. Custom lines move
 * nothing. */
function saleMovements(
  lines: LineInput[],
  warehouseId: number,
  note: string,
): StockLine[] {
  return lines.filter(isInventoryLine).map((line) => ({
    itemId: line.item_id,
    warehouseId,
    quantity: -line.quantity,
    type: "sale",
    unitPrice: line.unit_price,
    note,
  }));
}

/**
 * The invoice's existing lines put back on the shelf — what delete does,
 * and the first half of an edit.
 *
 * At the cost each line left at, which the line has carried since 14.6: the
 * units return to stock worth what they were worth when they went. A line
 * from before that has no cost, and comes back at the current average.
 */
function returnMovements(
  lines: StoredLine[],
  warehouseId: number,
  note: string,
): StockLine[] {
  return lines
    .filter((line): line is StoredLine & { itemId: number } =>
      Boolean(line.itemId),
    )
    .map((line) => ({
      itemId: line.itemId,
      warehouseId,
      quantity: line.quantity.toNumber(),
      type: "reversal",
      unitCost: line.unitCost?.toNumber() ?? null,
      note,
    }));
}

/**
 * The line rows, each inventory line carrying the cost it left the shelf at
 * — `costs` is in the order of the inventory lines, as the stock service
 * returned them. Stored so a margin reported later is the one made at the
 * time, not one recomputed from whatever the item costs then.
 */
async function writeLineRows(
  tx: Prisma.TransactionClient,
  invoiceId: number,
  lines: LineInput[],
  costs: number[],
  workspaceId: number,
): Promise<void> {
  let inventoryIndex = 0;

  await tx.saleInvoiceItem.createMany({
    data: lines.map((line) => {
      const inventory = isInventoryLine(line);
      return {
        workspaceId,
        invoiceId,
        itemId: inventory ? line.item_id : null,
        quantity: line.quantity,
        unitPrice: line.unit_price,
        totalPrice: lineTotal(line),
        unitCost: inventory ? costs[inventoryIndex++] : null,
        name: inventory ? line.name : (line.name ?? "آیتم دلخواه"),
        unit: inventory ? line.unit : (line.unit ?? "عدد"),
      };
    }),
  });
}

/**
 * The invoice and its lines, read under a row lock on the invoice — inside
 * the transaction rather than before it, so two deletes cannot both find it
 * and both put its goods back.
 */
async function lockInvoice(
  tx: Prisma.TransactionClient,
  id: number,
  workspaceId: number,
) {
  const locked = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM sale_invoices
    WHERE id = ${id} AND workspace_id = ${workspaceId}
    FOR UPDATE
  `;
  if (locked.length === 0) return null;

  return tx.saleInvoice.findFirst({
    where: { id, workspaceId },
    include: {
      items: { select: { itemId: true, quantity: true, unitCost: true } },
    },
  });
}

class InvoiceNotFound extends Error {}

// POST /api/sale-invoices
export const create = async (req: Request, res: Response) => {
  try {
    const body = (req as ValidatedRequest).valid.body as SaleInvoiceCreateBody;
    const actorId = (req as AuthenticatedRequest).user?.id ?? null;
    // Read once, outside the transaction, and passed to every write inside
    // it: the request isn't available in there.
    const workspaceId = workspaceIdOf(req);

    const lines = body.items as LineInput[];
    const totalAmount = invoiceTotal(lines);

    // One transaction: a refusal from the stock service — not enough on the
    // shelf, an item from another workspace — rolls back the invoice and the
    // number it drew.
    const invoice = await runInWorkspaceTransaction(workspaceId, async (tx) => {
      const warehouseId = await resolveWarehouseId(
        tx,
        workspaceId,
        body.warehouse_id,
      );

      const created = await tx.saleInvoice.create({
        data: {
          workspaceId,
          invoiceNumber: await nextInvoiceNumber(tx, workspaceId, "sale"),
          warehouseId,
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

      const moved = await applyStockMovements(
        tx,
        workspaceId,
        {
          referenceType: REFERENCE_TYPE,
          referenceId: created.id,
          occurredAt: created.invoiceDate,
          actorId,
        },
        saleMovements(lines, warehouseId, "فروش از فاکتور"),
      );

      await writeLineRows(
        tx,
        created.id,
        lines,
        moved.map((movement) => movement.unitCost),
        workspaceId,
      );

      return created;
    });

    res.status(201).json({
      id: invoice.id,
      invoice_number: invoice.invoiceNumber,
      total_amount: invoice.totalAmount.toNumber(),
      payment_status: invoice.paymentStatus,
    });
  } catch (error) {
    if (error instanceof StockError) {
      return res.status(400).json({ error: error.message });
    }
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

    const lines = body.items as LineInput[];
    const totalAmount = invoiceTotal(lines);
    const note = "ویرایش فاکتور فروش";

    await runInWorkspaceTransaction(workspaceId, async (tx) => {
      const existing = await lockInvoice(tx, id, workspaceId);
      if (!existing) throw new InvoiceNotFound();

      const warehouseId =
        body.warehouse_id === null || body.warehouse_id === undefined
          ? existing.warehouseId
          : await resolveWarehouseId(tx, workspaceId, body.warehouse_id);

      // The old lines go back on the shelf before the new ones come off it,
      // so an edit that raises a quantity can draw on what this same invoice
      // was already holding. One call, so a refusal of the new lines undoes
      // the return too — the old code once wrote the return before checking,
      // and a rejected edit inflated the stock for good.
      const returns = returnMovements(
        existing.items,
        existing.warehouseId,
        note,
      );
      const moved = await applyStockMovements(
        tx,
        workspaceId,
        {
          referenceType: REFERENCE_TYPE,
          referenceId: id,
          occurredAt: body.invoice_date ?? new Date(),
          actorId,
        },
        [...returns, ...saleMovements(lines, warehouseId, note)],
      );

      await tx.saleInvoiceItem.deleteMany({ where: { invoiceId: id } });

      await tx.saleInvoice.update({
        where: { id },
        data: {
          customerId: body.customer_id ?? null,
          customerName: body.customer_name,
          customerPhone: body.customer_phone,
          deviceId: body.device_id ?? null,
          warehouseId,
          invoiceDate: body.invoice_date ?? new Date(),
          totalAmount,
          paidAmount: body.paid_amount,
          paymentStatus: paymentStatusFor(body.paid_amount, totalAmount),
          note: body.note,
        },
      });

      // The sale movements are the ones after the returns.
      await writeLineRows(
        tx,
        id,
        lines,
        moved.slice(returns.length).map((movement) => movement.unitCost),
        workspaceId,
      );
    });

    res.json({ message: "فاکتور با موفقیت ویرایش شد" });
  } catch (error) {
    if (error instanceof InvoiceNotFound) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }
    if (error instanceof StockError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: errorMessage(error) });
  }
};

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

    await runInWorkspaceTransaction(workspaceId, async (tx) => {
      // The invoice, not its lines: an invoice with no lines is still one,
      // and used to be impossible to delete.
      const invoice = await lockInvoice(tx, id, workspaceId);
      if (!invoice) throw new InvoiceNotFound();

      await applyStockMovements(
        tx,
        workspaceId,
        { referenceType: REFERENCE_TYPE, referenceId: id, actorId },
        returnMovements(
          invoice.items,
          invoice.warehouseId,
          "ابطال فاکتور فروش",
        ),
      );

      // The lines go with it via onDelete: Cascade.
      await tx.saleInvoice.delete({ where: { id } });
    });

    res.json({ message: "فاکتور فروش حذف و موجودی کالاها بازگردانده شد" });
  } catch (error) {
    if (error instanceof InvoiceNotFound) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }
    if (error instanceof StockError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: errorMessage(error) });
  }
};
