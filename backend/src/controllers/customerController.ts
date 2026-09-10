import { Request, Response } from "express";
import prisma from "../lib/prisma";
import type { Prisma } from "../generated/prisma/client";
import { ValidatedRequest } from "../middleware/validate";
import { serialize } from "../utils/serialize";
import { errorMessage } from "../utils/errors";
import persianToEnglish from "../utils/persianToEnglish";
import type { IdParam } from "../schemas/common";
import type {
  CustomerBody,
  CustomerListQuery,
  CustomerNotesBody,
} from "../schemas/customer";
import { workspaceIdOf } from "../utils/workspace";
import {
  FAILED_STATUSES,
  isActive,
  SUCCESSFUL_STATUSES,
} from "../utils/deviceStatus";

// GET /api/customers
export const getAll = async (req: Request, res: Response) => {
  try {
    const { search, page, limit } = (req as ValidatedRequest).valid
      .query as CustomerListQuery;

    const where: Prisma.CustomerWhereInput = {
      workspaceId: workspaceIdOf(req),
    };
    if (search) {
      const term = persianToEnglish(search);
      // SQLite's LIKE was case-insensitive for ASCII by default; Postgres's
      // is not, so the mode has to be requested to keep search behaving the
      // same for latin-script names and phone numbers.
      where.OR = [
        { name: { contains: term, mode: "insensitive" } },
        { phone: { contains: term, mode: "insensitive" } },
      ];
    }

    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          phone: true,
          _count: { select: { devices: true } },
        },
      }),
    ]);

    res.json({
      data: customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        device_count: customer._count.devices,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/customers/:id
export const getOne = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;

    // Scoped by workspace as well as id: without it, an id from another
    // workspace would resolve.
    const customer = await prisma.customer.findFirst({
      where: { id, workspaceId: workspaceIdOf(req) },
    });
    if (!customer) {
      return res.status(404).json({ error: "مشتری یافت نشد" });
    }

    res.json(serialize(customer));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

/**
 * A cancelled invoice is not money owed and not money taken. It is excluded
 * from the customer's total the same way the invoice lists exclude it from
 * an outstanding balance.
 */
const CANCELLED = "cancelled";

interface TimelineEvent {
  type: "registered" | "delivered" | "invoiced" | "paid";
  date: string;
  /** Set on the two invoice events. */
  invoice_number?: string;
  amount?: number;
}

// GET /api/customers/:id/overview
export const getOverview = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;
    const workspaceId = workspaceIdOf(req);

    // findFirst, not findUnique: the id alone would resolve a customer
    // belonging to another workspace.
    const customer = await prisma.customer.findFirst({
      where: { id, workspaceId },
      select: {
        id: true,
        name: true,
        phone: true,
        notes: true,
        createdAt: true,
      },
    });

    if (!customer) {
      return res.status(404).json({ error: "مشتری یافت نشد" });
    }

    // Four reads rather than one join: the page shows four independent
    // lists, and a join would multiply the device rows by their invoices.
    // Parallel because none of them depends on another — but see the note
    // on the dashboard in HANDOFF §6.11: the pool is ten connections and
    // each of these is its own transaction.
    const [devices, repairInvoices, saleInvoices] = await Promise.all([
      prisma.device.findMany({
        where: { customerId: id, workspaceId },
        orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          deviceName: true,
          brand: true,
          model: true,
          serialNumber: true,
          status: true,
          entryDate: true,
          exitDate: true,
          createdAt: true,
          assignments: {
            select: { personnel: { select: { id: true, fullName: true } } },
          },
        },
      }),
      prisma.repairInvoice.findMany({
        where: { customerId: id, workspaceId },
        orderBy: { invoiceDate: "desc" },
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          totalAmount: true,
          paidAmount: true,
          paymentStatus: true,
          deviceId: true,
          payments: {
            orderBy: { paymentDate: "asc" },
            select: { amount: true, paymentDate: true },
          },
        },
      }),
      prisma.saleInvoice.findMany({
        where: { customerId: id, workspaceId },
        orderBy: { invoiceDate: "desc" },
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          totalAmount: true,
          paidAmount: true,
          paymentStatus: true,
          deviceId: true,
        },
      }),
    ]);

    const paidOn = (status: string, amount: number) =>
      status === CANCELLED ? 0 : amount;

    const totalPaid =
      repairInvoices.reduce(
        (sum, invoice) =>
          sum + paidOn(invoice.paymentStatus, invoice.paidAmount.toNumber()),
        0,
      ) +
      saleInvoices.reduce(
        (sum, invoice) =>
          sum + paidOn(invoice.paymentStatus, invoice.paidAmount.toNumber()),
        0,
      );

    // The last time this person walked in — the most recent intake, falling
    // back to when the row was created for a device with no entry date.
    const visits = devices.map(
      (device) => device.entryDate ?? device.createdAt,
    );
    const lastVisit =
      visits.length > 0
        ? new Date(Math.max(...visits.map((date) => date.getTime())))
        : null;

    // The timeline is per device, and the invoices that belong to a device
    // are its repair invoice and any sale invoice raised against it.
    const timeline = devices.map((device) => {
      const events: TimelineEvent[] = [];

      const entry = device.entryDate ?? device.createdAt;
      events.push({ type: "registered", date: entry.toISOString() });

      if (device.exitDate) {
        events.push({
          type: "delivered",
          date: device.exitDate.toISOString(),
        });
      }

      for (const invoice of repairInvoices) {
        if (invoice.deviceId !== device.id) continue;

        events.push({
          type: "invoiced",
          date: invoice.invoiceDate.toISOString(),
          invoice_number: invoice.invoiceNumber,
          amount: invoice.totalAmount.toNumber(),
        });

        // Repair invoices record each payment with its own date, so the
        // timeline can say when the money arrived. Sale invoices carry only
        // a paid amount and a status — there is no date to show, so they
        // contribute no payment event rather than a made-up one.
        for (const payment of invoice.payments) {
          events.push({
            type: "paid",
            date: payment.paymentDate.toISOString(),
            invoice_number: invoice.invoiceNumber,
            amount: payment.amount.toNumber(),
          });
        }
      }

      for (const invoice of saleInvoices) {
        if (invoice.deviceId !== device.id) continue;

        events.push({
          type: "invoiced",
          date: invoice.invoiceDate.toISOString(),
          invoice_number: invoice.invoiceNumber,
          amount: invoice.totalAmount.toNumber(),
        });
      }

      events.sort((a, b) => a.date.localeCompare(b.date));

      return {
        device_id: device.id,
        device_name: device.deviceName,
        brand: device.brand,
        model: device.model,
        status: device.status,
        events,
      };
    });

    const invoiceRow = (
      kind: "repair" | "sale",
      invoice: {
        id: number;
        invoiceNumber: string;
        invoiceDate: Date;
        totalAmount: { toNumber(): number };
        paidAmount: { toNumber(): number };
        paymentStatus: string;
        deviceId: number | null;
      },
    ) => ({
      kind,
      id: invoice.id,
      invoice_number: invoice.invoiceNumber,
      invoice_date: invoice.invoiceDate.toISOString(),
      total_amount: invoice.totalAmount.toNumber(),
      paid_amount: invoice.paidAmount.toNumber(),
      payment_status: invoice.paymentStatus,
      device_id: invoice.deviceId,
    });

    const invoices = [
      ...repairInvoices.map((invoice) => invoiceRow("repair", invoice)),
      ...saleInvoices.map((invoice) => invoiceRow("sale", invoice)),
    ].sort((a, b) => b.invoice_date.localeCompare(a.invoice_date));

    res.json({
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        notes: customer.notes,
        created_at: customer.createdAt.toISOString(),
      },
      summary: {
        total_devices: devices.length,
        active_devices: devices.filter((device) => isActive(device.status))
          .length,
        successful_repairs: devices.filter((device) =>
          SUCCESSFUL_STATUSES.includes(device.status),
        ).length,
        failed_repairs: devices.filter((device) =>
          FAILED_STATUSES.includes(device.status),
        ).length,
        total_paid: totalPaid,
        last_visit: lastVisit?.toISOString() ?? null,
      },
      devices: devices.map((device) => ({
        id: device.id,
        device_name: device.deviceName,
        brand: device.brand,
        model: device.model,
        serial_number: device.serialNumber,
        status: device.status,
        entry_date: device.entryDate?.toISOString() ?? null,
        exit_date: device.exitDate?.toISOString() ?? null,
        assignees: device.assignments.map((assignment) => ({
          id: assignment.personnel.id,
          name: assignment.personnel.fullName,
        })),
      })),
      timeline,
      invoices,
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// PUT /api/customers/:id/notes
export const updateNotes = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const { notes } = valid.body as CustomerNotesBody;
    const workspaceId = workspaceIdOf(req);

    // updateMany, not update: `update` matches on the primary key alone and
    // would write to another workspace's row before the extension's filter
    // could be expressed. The count tells us whether anything matched.
    const { count } = await prisma.customer.updateMany({
      where: { id, workspaceId },
      data: { notes },
    });

    if (count === 0) {
      return res.status(404).json({ error: "مشتری یافت نشد" });
    }

    res.json({ message: "یادداشت ذخیره شد", notes });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// POST /api/customers
export const create = async (req: Request, res: Response) => {
  try {
    const data = (req as ValidatedRequest).valid.body as CustomerBody;

    const customer = await prisma.customer.create({
      data: { ...data, workspaceId: workspaceIdOf(req) },
    });

    res.status(201).json(serialize(customer));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// PUT /api/customers/:id
export const update = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const data = valid.body as CustomerBody;

    const workspaceId = workspaceIdOf(req);

    const existing = await prisma.customer.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "مشتری یافت نشد" });
    }

    const customer = await prisma.customer.update({ where: { id }, data });
    res.json(serialize(customer));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// DELETE /api/customers/:id
// DELETE /api/customers/:id
export const remove = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;

    // deleteMany rather than delete: delete() throws P2025 for a missing row,
    // and the composite id + workspaceId condition findUnique can't express
    // is needed anyway. Detaching the customer's devices is no longer done by
    // hand — the schema's onDelete: SetNull does it.
    const deleted = await prisma.customer.deleteMany({
      where: { id, workspaceId: workspaceIdOf(req) },
    });

    // The old sql.js handler answered success for an id that never existed.
    // Kept until the isolation tests showed devices and items answering 404
    // for the same case: one operation reporting three different ways is a
    // frontend bug waiting to happen.
    if (deleted.count === 0) {
      return res.status(404).json({ error: "مشتری یافت نشد" });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};
