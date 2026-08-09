import { Request, Response } from "express";
import prisma from "../lib/prisma";
import type { Category } from "../generated/prisma/client";
import { ValidatedRequest } from "../middleware/validate";
import { errorMessage, isUniqueConstraintError } from "../utils/errors";
import type { IdParam } from "../schemas/common";
import type { CategoryBody } from "../schemas/category";
import { workspaceIdOf } from "../utils/workspace";

// Hand-mapped rather than serialized: this endpoint has always answered in
// camelCase, unlike most of the API. Kept as-is so the frontend doesn't need
// touching for a database migration.
function toCategoryResponse(category: Category) {
  return {
    id: category.id,
    name: category.name,
    description: category.description,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

const DUPLICATE_NAME = { error: "این نام قبلاً ثبت شده است" };

// GET /api/categories
export const getAll = async (req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      where: { workspaceId: workspaceIdOf(req) },
      orderBy: { name: "asc" },
    });

    res.json(categories.map(toCategoryResponse));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/categories/:id
export const getById = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;

    // findFirst rather than findUnique: the id alone would resolve a
    // category belonging to another workspace.
    const category = await prisma.category.findFirst({
      where: { id, workspaceId: workspaceIdOf(req) },
    });
    if (!category) {
      return res.status(404).json({ error: "دسته‌بندی یافت نشد" });
    }

    res.json(toCategoryResponse(category));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// POST /api/categories
export const create = async (req: Request, res: Response) => {
  try {
    const data = (req as ValidatedRequest).valid.body as CategoryBody;

    const category = await prisma.category.create({
      data: { ...data, workspaceId: workspaceIdOf(req) },
    });

    res.status(201).json(toCategoryResponse(category));
  } catch (error) {
    // Relies on the constraint rather than a prior lookup: checking first
    // leaves a window where another request inserts the same name in between.
    if (isUniqueConstraintError(error)) {
      return res.status(400).json(DUPLICATE_NAME);
    }
    res.status(500).json({ error: errorMessage(error) });
  }
};

// PUT /api/categories/:id
export const update = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const data = valid.body as CategoryBody;

    const existing = await prisma.category.findFirst({
      where: { id, workspaceId: workspaceIdOf(req) },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "دسته‌بندی یافت نشد" });
    }

    const category = await prisma.category.update({ where: { id }, data });

    res.json(toCategoryResponse(category));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(400).json(DUPLICATE_NAME);
    }
    res.status(500).json({ error: errorMessage(error) });
  }
};

// DELETE /api/categories/:id
export const remove = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;

    const category = await prisma.category.findFirst({
      where: { id, workspaceId: workspaceIdOf(req) },
      select: { _count: { select: { items: true } } },
    });

    if (!category) {
      return res.status(404).json({ error: "دسته‌بندی یافت نشد" });
    }

    // The schema would detach the items via onDelete: SetNull instead of
    // refusing, so the refusal has to be explicit here to preserve the
    // existing behaviour.
    if (category._count.items > 0) {
      return res.status(400).json({
        error: `این دسته‌بندی دارای ${category._count.items} کالا است و قابل حذف نیست`,
      });
    }

    await prisma.category.delete({ where: { id } });

    res.json({ message: "دسته‌بندی با موفقیت حذف شد" });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};
