import { Request, Response } from "express";
import prisma from "../lib/prisma";
import type { Prisma } from "../generated/prisma/client";
import { ValidatedRequest } from "../middleware/validate";
import { serialize } from "../utils/serialize";
import { errorMessage } from "../utils/errors";
import persianToEnglish from "../utils/persianToEnglish";
import type { IdParam } from "../schemas/common";
import type { CustomerBody, CustomerListQuery } from "../schemas/customer";
import { workspaceIdOf } from "../utils/workspace";

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

// GET /api/customers/:id/devices
export const getDevices = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;

    const devices = await prisma.device.findMany({
      where: { customerId: id, workspaceId: workspaceIdOf(req) },
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        customerId: true,
        deviceName: true,
        brand: true,
        model: true,
        serialNumber: true,
        entryDate: true,
        exitDate: true,
        status: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json(serialize(devices));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/customers/:id/stats
export const getStats = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;

    // Aggregated in JS rather than via $queryRaw: raw SQL would bypass the
    // Prisma Client extension that scopes queries by workspaceId in phase 2,
    // leaving RLS as the only guard. One customer holds at most a few hundred
    // devices, so loading them is cheap.
    const devices = await prisma.device.findMany({
      where: { customerId: id, workspaceId: workspaceIdOf(req) },
      select: { status: true, entryDate: true, exitDate: true },
    });

    const successfulRepairs = devices.filter(
      (device) => device.status === "repaired" || device.status === "delivered",
    ).length;

    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    const repairDurations = devices
      .filter((device) => device.entryDate !== null && device.exitDate !== null)
      .map(
        (device) =>
          (device.exitDate!.getTime() - device.entryDate!.getTime()) /
          millisecondsPerDay,
      );

    const averageDays =
      repairDurations.length > 0
        ? repairDurations.reduce((sum, days) => sum + days, 0) /
          repairDurations.length
        : null;

    res.json({
      total_devices: devices.length,
      successful_repairs: successfulRepairs,
      // Kept as a fixed-precision string, matching what the old handler
      // returned via toFixed(1).
      avg_repair_days: averageDays === null ? null : averageDays.toFixed(1),
    });
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
export const remove = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;

    // deleteMany rather than delete: the old handler answered
    // { success: true } even for an id that no longer existed, and delete()
    // throws P2025 instead. Detaching the customer's devices is no longer
    // done by hand — the schema's onDelete: SetNull does it.
    await prisma.customer.deleteMany({
      where: { id, workspaceId: workspaceIdOf(req) },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};
