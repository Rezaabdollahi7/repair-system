import { Request, Response } from "express";
import prisma from "../lib/prisma";
import type { Prisma, Service } from "../generated/prisma/client";
import { ValidatedRequest } from "../middleware/validate";
import { errorMessage } from "../utils/errors";
import type { IdParam } from "../schemas/common";
import type { ServiceCreateBody, ServiceUpdateBody } from "../schemas/service";

/**
 * snake_case, matching what this endpoint has always returned. Deliberately
 * omits createdAt/updatedAt, which the old handler didn't expose either.
 */
function toServiceResponse(service: Service) {
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    default_price: service.defaultPrice.toNumber(),
    unit: service.unit,
    is_active: service.isActive,
    sort_order: service.sortOrder,
  };
}

// GET /api/services
export const getAll = async (req: Request, res: Response) => {
  try {
    // The old handler created the services table and seeded four default rows
    // on every call. Both now live in the schema and prisma/seed.ts, so this
    // is a plain read.
    const services = await prisma.service.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    res.json(services.map(toServiceResponse));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// POST /api/services
export const create = async (req: Request, res: Response) => {
  try {
    const body = (req as ValidatedRequest).valid.body as ServiceCreateBody;

    const service = await prisma.service.create({
      data: {
        name: body.name,
        description: body.description,
        defaultPrice: body.default_price,
        unit: body.unit,
      },
    });

    // The old handler answered with just { id, name }. Returning the whole
    // record instead: it costs nothing, and every other create in the API
    // does the same.
    res.status(201).json(toServiceResponse(service));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// PUT /api/services/:id
export const update = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const body = valid.body as ServiceUpdateBody;

    const existing = await prisma.service.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "خدمت یافت نشد" });
    }

    // Built key by key so an absent field keeps its current value. The old
    // handler wrote every column unconditionally, so a request carrying only
    // a name blanked the price, unit and sort order.
    const data: Prisma.ServiceUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.default_price !== undefined) {
      data.defaultPrice = body.default_price;
    }
    if (body.unit !== undefined) data.unit = body.unit;
    if (body.is_active !== undefined) data.isActive = body.is_active;
    if (body.sort_order !== undefined) data.sortOrder = body.sort_order;

    const service = await prisma.service.update({ where: { id }, data });

    res.json(toServiceResponse(service));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// DELETE /api/services/:id
export const remove = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;

    // deleteMany rather than delete so a missing id is a no-op instead of
    // P2025, matching the old handler's unconditional success. Repair invoice
    // lines copy the service name and price at the time they're written, so
    // removing a service doesn't disturb existing invoices.
    const deleted = await prisma.service.deleteMany({ where: { id } });

    if (deleted.count === 0) {
      return res.status(404).json({ error: "خدمت یافت نشد" });
    }

    res.json({ message: "خدمت با موفقیت حذف شد" });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};
