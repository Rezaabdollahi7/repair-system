import { Request, Response } from "express";
import prisma, { runInWorkspaceTransaction } from "../lib/prisma";
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
import { workspaceIdOf } from "../utils/workspace";
import { nextReceptionNumber } from "../utils/deviceNumber";
import {
  notifyCustomer,
  transitionNotification,
  type NotifyOutcome,
} from "../utils/customerNotification";
import type { AuthenticatedRequest } from "../types/request";
import type { DeviceSmsKind } from "../utils/smsTemplates";

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
    // Both, and each does a different job: `id` is what the frontend opens
    // modals and builds routes with, `reception_number` is what the shop and
    // its customer call this device. They were the same value until 2.9.
    reception_number: device.receptionNumber,
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

  /*
   * A number typed into the search box is a reception number, not a primary
   * key: it is what the shop wrote on the slip and what the customer quotes
   * over the phone. Before 2.9 the two were the same value, so this matched
   * `id` and nobody could tell the difference.
   *
   * Exact rather than a LIKE against the digits, which is what the sql.js
   * version did — searching "12" also matched 120 and 512.
   */
  const asNumber = Number(term);
  if (Number.isInteger(asNumber) && asNumber > 0) {
    filters.push({ receptionNumber: asNumber });
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

    const conditions: Prisma.DeviceWhereInput[] = [
      { workspaceId: workspaceIdOf(req) },
    ];
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

    // Always at least the workspace condition now, so no empty-where branch.
    const where: Prisma.DeviceWhereInput = { AND: conditions };

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

    // findFirst rather than findUnique: the id alone would resolve a device
    // belonging to another workspace.
    const device = await prisma.device.findFirst({
      where: { id, workspaceId: workspaceIdOf(req) },
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

/**
 * Sends the customer notification a device write has earned, if any.
 *
 * ⚠️ Called **after** the write has committed, never inside it (§29 of the
 * brief). Two reasons, and both have bitten this codebase already: a status
 * change that fails must not text a customer about something that did not
 * happen, and a provider call that takes twenty seconds must not be holding
 * a row lock while it does.
 *
 * Its failures never reach the caller. notifyCustomer does not throw, and
 * the outcome rides back on the response so the modal can say what became of
 * the message — a device that saved correctly is a device that saved
 * correctly, whatever sms.ir was doing at the time.
 */
async function notifyIfAsked(
  req: Request,
  device: DeviceWithRelations,
  kind: DeviceSmsKind | null,
  asked: boolean | undefined,
): Promise<NotifyOutcome | undefined> {
  if (!asked || kind === null) {
    return undefined;
  }

  return notifyCustomer({
    workspaceId: workspaceIdOf(req),
    kind,
    device: {
      id: device.id,
      receptionNumber: device.receptionNumber,
      deviceName: device.deviceName,
      customerId: device.customerId,
      customer: device.customer,
    },
    actorId: (req as AuthenticatedRequest).user?.id ?? null,
  });
}

/**
 * Today, as a date input would have produced it.
 *
 * Midnight UTC built from the *local* calendar day, which is the shape every
 * other date in this table already has: the pickers submit "۱۴۰۵-۰۶-۲۳",
 * zod coerces that to midnight UTC, and the exports and the list read the
 * day back through the local timezone. Stamping `new Date()` instead would
 * put a time of day in a column where nothing else has one, and an evening
 * hand-over in Tehran would read back as the following day.
 */
function todayAsDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

// POST /api/devices
export const create = async (req: Request, res: Response) => {
  try {
    const body = (req as ValidatedRequest).valid.body as DeviceCreateBody;

    const workspaceId = workspaceIdOf(req);

    /*
     * In a transaction now, which it did not need to be before 2.9.
     *
     * The counter and the device have to move together: if the insert fails
     * after the number is drawn, the number has to come back rather than
     * leaving a hole in a series a shop reads as continuous. Same reasoning
     * as invoice numbering, and the same helper — a bare $transaction would
     * run outside the workspace context the extension sets.
     */
    const device = await runInWorkspaceTransaction(workspaceId, async (tx) =>
      tx.device.create({
        data: {
          workspaceId,
          receptionNumber: await nextReceptionNumber(tx, workspaceId),
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
      }),
    );

    // Acceptance is the one message tied to creation rather than to a
    // transition, and this is the only place it can be sent from. An edit
    // must never re-send it however the status moves (§11) — which is why
    // `update` below has no path to this kind at all.
    const sms = await notifyIfAsked(
      req,
      device,
      "device_accepted",
      body.send_sms,
    );

    res.status(201).json({ ...toDeviceResponse(device), sms });
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

    // `status` as well as the id now: the message a change owes depends on
    // where the device came from, not on where it ends up, and after the
    // update that information is gone.
    const existing = await prisma.device.findFirst({
      where: { id, workspaceId: workspaceIdOf(req) },
      select: { id: true, status: true },
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

    /*
     * A device that has just been handed back left the shop today, and the
     * exit date is the one field nobody remembers to fill in — the status
     * picker in the list does not even show it.
     *
     * Stamped on the *transition* rather than on the value, for the same
     * reason the notification is: re-saving a device that was already
     * delivered must not move the date it was delivered on. And only when
     * the request did not set the field itself, so a shop correcting the
     * date of a hand-over it is recording late still wins.
     */
    if (
      body.status === "delivered" &&
      existing.status !== "delivered" &&
      body.exit_date === undefined
    ) {
      data.exitDate = todayAsDateOnly();
    }

    const device = await prisma.device.update({
      where: { id },
      data,
      include: deviceInclude,
    });

    // Read off the row the database returned rather than off the request:
    // an update that left `status` out has not changed it, and comparing
    // against `body.status` would read that absence as a move to undefined.
    const sms = await notifyIfAsked(
      req,
      device,
      transitionNotification(existing.status, device.status),
      body.send_sms,
    );

    res.json({ ...toDeviceResponse(device), sms });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// DELETE /api/devices/:id
export const remove = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;

    const device = await prisma.device.findFirst({
      where: { id, workspaceId: workspaceIdOf(req) },
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
    await deleteDeviceImages(id, workspaceIdOf(req));

    await prisma.device.delete({ where: { id } });

    res.json({ message: "دستگاه و عکس‌های آن حذف شد" });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};
