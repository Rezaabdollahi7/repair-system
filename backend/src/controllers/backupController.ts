import { Request, Response } from "express";
import prisma from "../lib/prisma";
import { errorMessage } from "../utils/errors";

/**
 * The old implementation zipped the SQLite file, which is no longer the
 * source of truth. Rather than hand back a worthless archive, the write
 * paths refuse outright.
 *
 * Backups return in phase 5 as two separate things: platform durability,
 * which runs as a cron on the database server rather than as an app feature,
 * and a per-workspace data export in a format a workshop owner can actually
 * open.
 */
const NOT_AVAILABLE = {
  error:
    "پشتیبان‌گیری در این نسخه در دسترس نیست. نگهداری داده‌ها بر عهده سرویس است و امکان خروجی گرفتن از اطلاعات در نسخه‌های بعدی اضافه می‌شود.",
};

// GET /api/backups
export const list = async (req: Request, res: Response) => {
  try {
    // Still a real query: the table survives into phase 5, and an empty list
    // renders as "no backups yet" rather than an error page.
    const backups = await prisma.backup.findMany({
      orderBy: { createdAt: "desc" },
      include: { author: { select: { fullName: true } } },
    });

    res.json(
      backups.map((backup) => ({
        id: backup.id,
        filename: backup.filename,
        size_bytes: Number(backup.sizeBytes),
        includes_uploads: backup.includesUploads,
        created_by: backup.createdBy,
        created_at: backup.createdAt.toISOString(),
        created_by_name: backup.author?.fullName ?? null,
      })),
    );
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// POST /api/backups
export const create = (req: Request, res: Response) => {
  res.status(501).json(NOT_AVAILABLE);
};

// GET /api/backups/:id/download
export const download = (req: Request, res: Response) => {
  res.status(501).json(NOT_AVAILABLE);
};

// POST /api/backups/:id/restore
export const restore = (req: Request, res: Response) => {
  res.status(501).json(NOT_AVAILABLE);
};

// DELETE /api/backups/:id
export const remove = (req: Request, res: Response) => {
  res.status(501).json(NOT_AVAILABLE);
};
