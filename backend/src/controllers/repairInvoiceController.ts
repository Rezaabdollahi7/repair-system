import { Request, Response } from "express";
import prisma from "../lib/prisma";
import type { Prisma } from "../generated/prisma/client";
import { ValidatedRequest } from "../middleware/validate";
import { AuthenticatedRequest } from "../types/request";
import { errorMessage } from "../utils/errors";
import { todayRange, todayStamp } from "../utils/invoiceNumber";
import { invoiceTotals, lineTotals } from "../utils/invoiceTotals";
import persianToEnglish from "../utils/persianToEnglish";
import type { IdParam } from "../schemas/common";
import type {
  RepairInvoiceCreateBody,
  RepairInvoiceListQuery,
  RepairInvoicePaymentBody,
  RepairInvoiceStatusBody,
  RepairInvoiceUpdateBody,
} from "../schemas/repairInvoice";

type LineInput = RepairInvoiceCreateBody["items"][number];

const invoiceInclude = {
  device: {
    select: {
      deviceName: true,
      brand: true,
      model: true,
      serialNumber: true,
    },
  },
  technician: { select: { fullName: true } },
} satisfies Prisma.RepairInvoiceInclude;

type InvoiceRow = Prisma.RepairInvoiceGetPayload<{
  include: typeof invoiceInclude;
}>;

function toInvoiceResponse(invoice: InvoiceRow) {
  return {
    id: invoice.id,
    invoice_number: invoice.invoiceNumber,
    device_id: invoice.deviceId,
    customer_id: invoice.customerId,
    customer_name: invoice.customerName,
    customer_phone: invoice.customerPhone,
    invoice_date: invoice.invoiceDate.toISOString(),
    due_date: invoice.dueDate?.toISOString() ?? null,
    status: invoice.status,
    subtotal: invoice.subtotal.toNumber(),
    discount_type: invoice.discountType,
    discount_value: invoice.discountValue.toNumber(),
    discount_amount: invoice.discountAmount.toNumber(),
    tax_rate: invoice.taxRate.toNumber(),
    tax_amount: invoice.taxAmount.toNumber(),
    total_amount: invoice.totalAmount.toNumber(),
    paid_amount: invoice.paidAmount.toNumber(),
    payment_status: invoice.paymentStatus,
    warranty_months: invoice.warrantyMonths,
    warranty_until: invoice.warrantyUntil?.toISOString() ?? null,
    technician_id: invoice.technicianId,
    notes: invoice.notes,
    created_by: invoice.createdBy,
    created_at: invoice.createdAt.toISOString(),
    updated_at: invoice.updatedAt.toISOString(),
    device_name: invoice.device.deviceName,
    brand: invoice.device.brand,
    model: invoice.device.model,
    serial_number: invoice.device.serialNumber,
    technician_name: invoice.technician?.fullName ?? null,
  };
}

/**
 * Invoice numbers keep their settings-driven prefix (INV- by default),
 * unlike purchase and sale invoices which hardcode theirs. Roadmap 1.7
 * unifies all three.
 */
async function nextInvoiceNumber(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const settings = await tx.settings.findUnique({
    where: { id: 1 },
    select: { invoicePrefix: true },
  });

  const todayCount = await tx.repairInvoice.count({
    where: { invoiceDate: todayRange() },
  });

  const prefix = settings?.invoicePrefix ?? "INV-";
  return `${prefix}${todayStamp()}-${String(todayCount + 1).padStart(4, "0")}`;
}

/**
 * Fills in the price and unit of any inventory line that arrived without
 * them, from the item's own record. Service lines carry their price from the
 * client and are left alone.
 */
async function resolveLinePrices(
  tx: Prisma.TransactionClient,
  lines: LineInput[],
): Promise<void> {
  for (const line of lines) {
    if (line.item_type !== "inventory" || !line.item_id) continue;
    if (line.unit_price) continue;

    const item = await tx.item.findUnique({
      where: { id: line.item_id },
      select: { sellPrice: true, unit: true },
    });
    if (!item) continue;

    line.unit_price = item.sellPrice.toNumber();
    line.unit = line.unit ?? item.unit;
  }
}

async function writeLines(
  tx: Prisma.TransactionClient,
  invoiceId: number,
  lines: LineInput[],
): Promise<void> {
  for (const [index, line] of lines.entries()) {
    const totals = lineTotals(line);

    await tx.repairInvoiceItem.create({
      data: {
        invoiceId,
        itemType: line.item_type,
        itemId: line.item_id ?? null,
        name: line.name,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit ?? "عدد",
        unitPrice: line.unit_price ?? 0,
        discountType: line.discount_type ?? null,
        discountValue: line.discount_value,
        discountAmount: totals.discountAmount,
        totalPrice: totals.totalPrice,
        sortOrder: index,
      },
    });
  }
}

interface StockLine {
  itemType: string;
  itemId: number | null;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
}

/**
 * Moves stock for the inventory lines of an invoice. `direction` is -1 when
 * the invoice is issued and the parts leave the shelf, +1 when it's
 * cancelled and they come back.
 */
async function moveStock(
  tx: Prisma.TransactionClient,
  invoiceId: number,
  lines: StockLine[],
  direction: -1 | 1,
  note: string,
  actorId: number | null,
): Promise<void> {
  for (const line of lines) {
    if (line.itemType !== "inventory" || line.itemId === null) continue;

    const quantity = Math.round(line.quantity.toNumber());
    const item = await tx.item.findUnique({
      where: { id: line.itemId },
      select: { currentStock: true },
    });
    if (!item) continue;

    await tx.item.update({
      where: { id: line.itemId },
      data: {
        currentStock: Math.max(0, item.currentStock + direction * quantity),
      },
    });

    await tx.inventoryTransaction.create({
      data: {
        itemId: line.itemId,
        // Issuing is a sale; putting parts back is an adjustment, matching
        // how the ledger recorded these before.
        type: direction === -1 ? "sale" : "adjustment",
        quantity: direction * quantity,
        unitPrice: line.unitPrice,
        // Passed as null before while reference_type was still set, so parts
        // consumed by a repair never showed the invoice in an item's history.
        referenceId: invoiceId,
        referenceType: "repair_invoice",
        note,
        createdBy: actorId,
      },
    });
  }
}

function warrantyUntil(from: Date, months: number): Date | null {
  if (months <= 0) return null;
  const until = new Date(from);
  until.setMonth(until.getMonth() + months);
  return until;
}

// GET /api/repair-invoices
export const getAll = async (req: Request, res: Response) => {
  try {
    const query = (req as ValidatedRequest).valid
      .query as RepairInvoiceListQuery;
    const { page, limit } = query;

    const where: Prisma.RepairInvoiceWhereInput = {};

    if (query.search) {
      const term = persianToEnglish(query.search);
      where.OR = [
        { invoiceNumber: { contains: term, mode: "insensitive" } },
        { customerName: { contains: term, mode: "insensitive" } },
        { device: { deviceName: { contains: term, mode: "insensitive" } } },
      ];
    }

    if (query.status) where.status = query.status;
    if (query.device_id !== undefined) where.deviceId = query.device_id;

    if (query.from_date || query.to_date) {
      where.invoiceDate = {
        ...(query.from_date ? { gte: query.from_date } : {}),
        ...(query.to_date ? { lte: query.to_date } : {}),
      };
    }

    const [total, invoices] = await Promise.all([
      prisma.repairInvoice.count({ where }),
      prisma.repairInvoice.findMany({
        where,
        orderBy: { invoiceDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: invoiceInclude,
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

// GET /api/repair-invoices/:id
export const getById = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;

    const invoice = await prisma.repairInvoice.findUnique({
      where: { id },
      include: {
        ...invoiceInclude,
        items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
        payments: { orderBy: { paymentDate: "desc" } },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }

    // Only inventory lines point at the items table. The old query joined on
    // item_id unconditionally, so a service line showed the code and unit of
    // whichever unrelated item happened to share that id.
    const inventoryIds = invoice.items
      .filter((line) => line.itemType === "inventory" && line.itemId !== null)
      .map((line) => line.itemId as number);

    const items = inventoryIds.length
      ? await prisma.item.findMany({
          where: { id: { in: inventoryIds } },
          select: { id: true, code: true, unit: true },
        })
      : [];

    const itemsById = new Map(items.map((item) => [item.id, item]));

    res.json({
      ...toInvoiceResponse(invoice),
      items: invoice.items.map((line) => {
        const catalogue =
          line.itemType === "inventory" && line.itemId !== null
            ? itemsById.get(line.itemId)
            : undefined;

        return {
          id: line.id,
          invoice_id: line.invoiceId,
          item_type: line.itemType,
          item_id: line.itemId,
          name: line.name,
          description: line.description,
          quantity: line.quantity.toNumber(),
          unit: line.unit,
          unit_price: line.unitPrice.toNumber(),
          discount_type: line.discountType,
          discount_value: line.discountValue.toNumber(),
          discount_amount: line.discountAmount.toNumber(),
          total_price: line.totalPrice.toNumber(),
          sort_order: line.sortOrder,
          item_code: catalogue?.code ?? null,
          item_unit: catalogue?.unit ?? null,
        };
      }),
      payments: invoice.payments.map((payment) => ({
        id: payment.id,
        invoice_id: payment.invoiceId,
        amount: payment.amount.toNumber(),
        payment_method: payment.paymentMethod,
        reference_number: payment.referenceNumber,
        note: payment.note,
        payment_date: payment.paymentDate.toISOString(),
        created_by: payment.createdBy,
        created_at: payment.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// POST /api/repair-invoices
export const create = async (req: Request, res: Response) => {
  try {
    const body = (req as ValidatedRequest).valid
      .body as RepairInvoiceCreateBody;
    const actorId = (req as AuthenticatedRequest).user?.id ?? null;

    const device = await prisma.device.findUnique({
      where: { id: body.device_id },
      select: {
        customerId: true,
        customer: { select: { name: true, phone: true } },
      },
    });

    if (!device) {
      return res.status(404).json({ error: "دستگاه یافت نشد" });
    }

    const invoiceDate = body.invoice_date ?? new Date();

    const invoice = await prisma.$transaction(async (tx) => {
      await resolveLinePrices(tx, body.items);

      const totals = invoiceTotals(
        body.items,
        body.discount_type,
        body.discount_value,
        body.tax_rate,
      );

      const created = await tx.repairInvoice.create({
        data: {
          invoiceNumber: await nextInvoiceNumber(tx),
          deviceId: body.device_id,
          customerId: device.customerId,
          customerName:
            body.customer_name ?? device.customer?.name ?? "مشتری متفرقه",
          customerPhone: body.customer_phone ?? device.customer?.phone ?? null,
          invoiceDate,
          dueDate: body.due_date ?? null,
          status: "draft",
          subtotal: totals.subtotal,
          discountType: body.discount_type ?? null,
          discountValue: body.discount_value,
          discountAmount: totals.discountAmount,
          taxRate: body.tax_rate,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          warrantyMonths: body.warranty_months,
          warrantyUntil: warrantyUntil(invoiceDate, body.warranty_months),
          technicianId: body.technician_id ?? null,
          notes: body.notes,
          createdBy: actorId,
        },
      });

      await writeLines(tx, created.id, body.items);

      return created;
    });

    res.status(201).json({
      id: invoice.id,
      invoice_number: invoice.invoiceNumber,
      total_amount: invoice.totalAmount.toNumber(),
      status: invoice.status,
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// PUT /api/repair-invoices/:id
export const update = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const body = valid.body as RepairInvoiceUpdateBody;

    const existing = await prisma.repairInvoice.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }

    if (existing.status !== "draft") {
      return res
        .status(400)
        .json({ error: "فقط فاکتورهای پیش‌نویس قابل ویرایش هستند" });
    }

    const invoiceDate = body.invoice_date ?? new Date();

    await prisma.$transaction(async (tx) => {
      await resolveLinePrices(tx, body.items);

      const totals = invoiceTotals(
        body.items,
        body.discount_type,
        body.discount_value,
        body.tax_rate,
      );

      await tx.repairInvoice.update({
        where: { id },
        data: {
          customerName: body.customer_name,
          customerPhone: body.customer_phone,
          invoiceDate,
          dueDate: body.due_date ?? null,
          subtotal: totals.subtotal,
          discountType: body.discount_type ?? null,
          discountValue: body.discount_value,
          discountAmount: totals.discountAmount,
          taxRate: body.tax_rate,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          warrantyMonths: body.warranty_months,
          warrantyUntil: warrantyUntil(invoiceDate, body.warranty_months),
          technicianId: body.technician_id ?? null,
          notes: body.notes,
        },
      });

      // Draft invoices haven't touched stock yet, so replacing the lines
      // needs no reversal.
      await tx.repairInvoiceItem.deleteMany({ where: { invoiceId: id } });
      await writeLines(tx, id, body.items);
    });

    res.json({ message: "فاکتور با موفقیت ویرایش شد" });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// PUT /api/repair-invoices/:id/status
export const changeStatus = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const { status } = valid.body as RepairInvoiceStatusBody;
    const actorId = (req as AuthenticatedRequest).user?.id ?? null;

    const invoice = await prisma.repairInvoice.findUnique({
      where: { id },
      select: {
        status: true,
        totalAmount: true,
        paidAmount: true,
        items: {
          select: {
            itemType: true,
            itemId: true,
            quantity: true,
            unitPrice: true,
          },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }

    if (invoice.status === "cancelled") {
      return res
        .status(400)
        .json({ error: "فاکتور ابطال شده قابل تغییر نیست" });
    }

    if (invoice.status === "paid" && status !== "paid") {
      return res
        .status(400)
        .json({ error: "فاکتور پرداخت شده قابل تغییر نیست" });
    }

    const totalAmount = invoice.totalAmount.toNumber();
    const paidAmount = invoice.paidAmount.toNumber();

    if (status === "paid" && paidAmount < totalAmount) {
      return res.status(400).json({ error: "مبلغ پرداختی کافی نیست" });
    }

    const issuing = status === "issued" && invoice.status === "draft";
    const cancelling =
      status === "cancelled" &&
      (invoice.status === "issued" || invoice.status === "paid");

    let paymentStatus: string | null = null;
    if (status === "paid") {
      paymentStatus = "paid";
    } else if (paidAmount > 0 && paidAmount < totalAmount) {
      paymentStatus = "partial";
    } else if (paidAmount === 0) {
      paymentStatus = "pending";
    }

    await prisma.$transaction(async (tx) => {
      if (issuing) {
        await moveStock(
          tx,
          id,
          invoice.items,
          -1,
          "مصرف در فاکتور تعمیر",
          actorId,
        );
      }

      if (cancelling) {
        await moveStock(
          tx,
          id,
          invoice.items,
          1,
          "ابطال فاکتور تعمیر - برگشت موجودی",
          actorId,
        );
      }

      await tx.repairInvoice.update({
        where: { id },
        data: {
          status,
          ...(paymentStatus ? { paymentStatus } : {}),
        },
      });
    });

    res.json({ message: `وضعیت فاکتور به ${status} تغییر کرد` });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// POST /api/repair-invoices/:id/payments
export const addPayment = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const body = valid.body as RepairInvoicePaymentBody;
    const actorId = (req as AuthenticatedRequest).user?.id ?? null;

    const invoice = await prisma.repairInvoice.findUnique({
      where: { id },
      select: { status: true, totalAmount: true, paidAmount: true },
    });

    if (!invoice) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }

    if (invoice.status === "draft") {
      return res.status(400).json({ error: "ابتدا باید فاکتور صادر شود" });
    }

    if (invoice.status === "cancelled") {
      return res.status(400).json({ error: "فاکتور ابطال شده است" });
    }

    const totalAmount = invoice.totalAmount.toNumber();
    const newPaid = invoice.paidAmount.toNumber() + body.amount;

    if (newPaid > totalAmount) {
      return res
        .status(400)
        .json({ error: "مبلغ پرداختی بیشتر از مبلغ فاکتور است" });
    }

    const fullyPaid = newPaid >= totalAmount;

    await prisma.$transaction(async (tx) => {
      await tx.repairInvoicePayment.create({
        data: {
          invoiceId: id,
          amount: body.amount,
          paymentMethod: body.payment_method,
          referenceNumber: body.reference_number,
          note: body.note,
          createdBy: actorId,
        },
      });

      await tx.repairInvoice.update({
        where: { id },
        data: {
          paidAmount: newPaid,
          paymentStatus: fullyPaid ? "paid" : "partial",
          ...(fullyPaid ? { status: "paid" } : {}),
        },
      });
    });

    res.json({
      message: "پرداخت با موفقیت ثبت شد",
      paid_amount: newPaid,
      payment_status: fullyPaid ? "paid" : "partial",
      remaining: totalAmount - newPaid,
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// DELETE /api/repair-invoices/:id
export const remove = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;
    const actorId = (req as AuthenticatedRequest).user?.id ?? null;

    const invoice = await prisma.repairInvoice.findUnique({
      where: { id },
      select: {
        status: true,
        items: {
          select: {
            itemType: true,
            itemId: true,
            quantity: true,
            unitPrice: true,
          },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }

    await prisma.$transaction(async (tx) => {
      // Only an issued or paid invoice ever took stock; a draft never did.
      if (invoice.status === "issued" || invoice.status === "paid") {
        await moveStock(
          tx,
          id,
          invoice.items,
          1,
          "ابطال فاکتور تعمیر - برگشت موجودی",
          actorId,
        );
      }

      // Lines and payments go with it via onDelete: Cascade.
      await tx.repairInvoice.delete({ where: { id } });
    });

    res.json({ message: "فاکتور با موفقیت حذف شد" });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};
