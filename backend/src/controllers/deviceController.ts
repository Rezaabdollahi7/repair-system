import { Request, Response } from "express";
import prisma from "../lib/prisma";
import type { Prisma } from "../generated/prisma/client";
import { ValidatedRequest } from "../middleware/validate";
import { errorMessage } from "../utils/errors";
import persianToEnglish from "../utils/persianToEnglish";
import { deleteDeviceImages } from "./imageController";
import type { IdParam } from "../schemas/common";
import type {
  DeviceCreateBody,
  DeviceListQuery,
  DeviceUpdateBody,
} from "../schemas/device";

// One query shape reused by every handler, so the response never depends on
// which endpoint produced it.
const deviceInclude = {
  customer: { select: { name: true, phone: true } },
  assignments: {
    orderBy: { assignedAt: "asc" },
    select: {
      personnel: { select: { id: true, fullName: true, username: true } },
    },
  },
  saleInvoices: {
    orderBy: { invoiceDate: "desc" },
    take: 1,
    select: { id: true, paymentStatus: true },
  },
  _count: { select: { saleInvoices: true } },
} satisfies Prisma.DeviceInclude;

type DeviceWithRelations = Prisma.DeviceGetPayload<{
  include: typeof deviceInclude;
}>;

/**
 * Mapped by hand rather than through serialize(): the response flattens the
 * customer relation into customer_name/customer_phone and derives three
 * invoice fields, none of which is a plain column rename.
 *
 * personnel_id is deliberately absent — the old mapper skipped it too, since
 * technicians come from device_assignments rather than that column.
 */
function toDeviceResponse(device: DeviceWithRelations) {
  const latestInvoice = device.saleInvoices[0];

  return {
    id: device.id,
    customer_id: device.customerId,
    device_name: device.deviceName,
    brand: device.brand,
    model: device.model,
    serial_number: device.serialNumber,
    entry_date: device.entryDate?.toISOString() ?? null,
    exit_date: device.exitDate?.toISOString() ?? null,
    status: device.status,
    description: device.description,
    created_at: device.createdAt.toISOString(),
    updated_at: device.updatedAt.toISOString(),
    needs_invoice: device.needsInvoice,
    customer_name: device.customer?.name ?? null,
    customer_phone: device.customer?.phone ?? null,
    invoice_status: latestInvoice?.paymentStatus ?? null,
    sale_invoice_id: latestInvoice?.id ?? null,
    invoice_count: device._count.saleInvoices,
    assignees: device.assignments.map((assignment) => ({
      id: assignment.personnel.id,
      name: assignment.personnel.fullName,
      username: assignment.personnel.username,
    })),
  };
}

function buildSearchFilter(search: string): Prisma.DeviceWhereInput[] {
  const term = persianToEnglish(search);
  const filters: Prisma.DeviceWhereInput[] = [
    { deviceName: { contains: term, mode: "insensitive" } },
    { brand: { contains: term, mode: "insensitive" } },
    { model: { contains: term, mode: "insensitive" } },
    { serialNumber: { contains: term, mode: "insensitive" } },
    { customer: { name: { contains: term, mode: "insensitive" } } },
    { customer: { phone: { contains: term, mode: "insensitive" } } },
  ];

  // The old query cast the id to text and used LIKE, so searching "12" also
  // matched 120 and 512. An exact match is both what a user typing an id
  // means and the only thing Prisma can express against an Int column.
  const asNumber = Number(term);
  if (Number.isInteger(asNumber) && asNumber > 0) {
    filters.push({ id: asNumber });
  }

  return filters;
}

/**
 * Each selected value contributes one alternative; a device matching any of
 * them passes. Safe to express with `some` because a device carries at most
 * one sale invoice, so "the latest invoice" and "any invoice" coincide.
 */
function buildInvoiceStatusFilter(
  statuses: string[],
): Prisma.DeviceWhereInput[] {
  const filters: Prisma.DeviceWhereInput[] = [];

  for (const status of statuses) {
    switch (status) {
      case "no_invoice":
        filters.push({ needsInvoice: true, saleInvoices: { none: {} } });
        break;
      case "paid":
        filters.push({ saleInvoices: { some: { paymentStatus: "paid" } } });
        break;
      case "unpaid":
        filters.push({
          saleInvoices: { some: { paymentStatus: { not: "paid" } } },
        });
        break;
      case "not_needed":
        filters.push({ needsInvoice: false });
        break;
      default:
        break;
    }
  }

  return filters;
}

// GET /api/devices
export const getAll = async (req: Request, res: Response) => {
  try {
    const query = (req as ValidatedRequest).valid.query as DeviceListQuery;
    const { page, limit } = query;

    const conditions: Prisma.DeviceWhereInput[] = [];

    if (query.search) {
      conditions.push({ OR: buildSearchFilter(query.search) });
    }

    if (query.status?.length) {
      conditions.push({ status: { in: query.status } });
    }

    if (query.model) {
      conditions.push({
        model: { contains: query.model, mode: "insensitive" },
      });
    }

    if (query.customer_id !== undefined) {
      conditions.push({ customerId: query.customer_id });
    }

    if (query.entry_from) {
      conditions.push({ entryDate: { gte: query.entry_from } });
    }

    if (query.entry_to) {
      conditions.push({ entryDate: { lte: query.entry_to } });
    }

    if (query.personnel_ids?.length) {
      conditions.push({
        assignments: { some: { personnelId: { in: query.personnel_ids } } },
      });
    }

    if (query.invoice_status?.length) {
      const invoiceFilters = buildInvoiceStatusFilter(query.invoice_status);
      if (invoiceFilters.length > 0) {
        conditions.push({ OR: invoiceFilters });
      }
    }

    const where: Prisma.DeviceWhereInput =
      conditions.length > 0 ? { AND: conditions } : {};

    // include rather than a query per device: the old handler ran one
    // assignee lookup for every row, so a page of ten cost eleven queries.
    const [total, devices] = await Promise.all([
      prisma.device.count({ where }),
      prisma.device.findMany({
        where,
        orderBy: { id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: deviceInclude,
      }),
    ]);

    res.json({
      data: devices.map(toDeviceResponse),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/devices/:id
export const getOne = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;

    const device = await prisma.device.findUnique({
      where: { id },
      include: deviceInclude,
    });

    if (!device) {
      return res.status(404).json({ error: "دستگاه یافت نشد" });
    }

    res.json(toDeviceResponse(device));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// POST /api/devices
export const create = async (req: Request, res: Response) => {
  try {
    const body = (req as ValidatedRequest).valid.body as DeviceCreateBody;

    const device = await prisma.device.create({
      data: {
        customerId: body.customer_id ?? null,
        deviceName: body.device_name,
        brand: body.brand,
        model: body.model,
        serialNumber: body.serial_number,
        entryDate: body.entry_date ?? null,
        exitDate: body.exit_date ?? null,
        status: body.status,
        description: body.description,
      },
      include: deviceInclude,
    });

    res.status(201).json(toDeviceResponse(device));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// PUT /api/devices/:id
export const update = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const body = valid.body as DeviceUpdateBody;

    const existing = await prisma.device.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "دستگاه یافت نشد" });
    }

    // Built key by key so an absent field stays untouched rather than being
    // overwritten with null — the frontend sends partial updates.
    const data: Prisma.DeviceUpdateInput = {};
    if (body.customer_id !== undefined) {
      data.customer =
        body.customer_id === null
          ? { disconnect: true }
          : { connect: { id: body.customer_id } };
    }
    if (body.device_name !== undefined) data.deviceName = body.device_name;
    if (body.brand !== undefined) data.brand = body.brand;
    if (body.model !== undefined) data.model = body.model;
    if (body.serial_number !== undefined) {
      data.serialNumber = body.serial_number;
    }
    if (body.entry_date !== undefined) data.entryDate = body.entry_date;
    if (body.exit_date !== undefined) data.exitDate = body.exit_date;
    if (body.status !== undefined) data.status = body.status;
    if (body.description !== undefined) data.description = body.description;
    if (body.needs_invoice !== undefined) {
      data.needsInvoice = body.needs_invoice;
    }

    const device = await prisma.device.update({
      where: { id },
      data,
      include: deviceInclude,
    });

    res.json(toDeviceResponse(device));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// DELETE /api/devices/:id
export const remove = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;

    const device = await prisma.device.findUnique({
      where: { id },
      select: { id: true, _count: { select: { repairInvoices: true } } },
    });

    if (!device) {
      return res.status(404).json({ error: "دستگاه یافت نشد" });
    }

    // repair_invoices.device_id is NOT NULL with onDelete: Restrict, so the
    // delete would fail at the database anyway. Refusing here turns that into
    // an explanation instead of a constraint error — and deleting the
    // invoices alongside would destroy financial history.
    if (device._count.repairInvoices > 0) {
      return res.status(409).json({
        error: "این دستگاه فاکتور تعمیر دارد و قابل حذف نیست",
      });
    }

    // Files first: the deviceImage rows go with the device via cascade, and
    // once they're gone there's nothing left pointing at the files on disk.
    await deleteDeviceImages(id);

    await prisma.device.delete({ where: { id } });

    res.json({ message: "دستگاه و عکس‌های آن حذف شد" });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};
