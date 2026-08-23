import { Request, Response } from "express";
import prisma from "../lib/prisma";
import { deleteObject, signedUrlFor } from "../lib/storage";
import { ValidatedRequest } from "../middleware/validate";
import { AuthenticatedRequest } from "../types/request";
import { errorMessage } from "../utils/errors";
import { buildExport } from "../utils/export/build";
import type { IdParam } from "../schemas/common";
import type { ExportCreateBody } from "../schemas/export";
import { workspaceIdOf } from "../utils/workspace";

/**
 * The build's own errors are not sent to the workshop: they are stack traces
 * and object keys, useful to an operator reading the log and to nobody else.
 */
const GENERIC_FAILURE = "ساخت خروجی با خطا مواجه شد. دوباره تلاش کنید";

/**
 * How long a pending row is believed. Generous: a thousand-image export on a
 * slow link is slow, and cutting a live build off would be worse than making
 * someone wait.
 */
const STALE_AFTER_MS = 30 * 60 * 1000;

function toExportResponse(row: {
  id: number;
  filename: string;
  sizeBytes: bigint;
  includesUploads: boolean;
  status: string;
  error: string | null;
  createdBy: number | null;
  createdAt: Date;
  author?: { fullName: string } | null;
}) {
  return {
    id: row.id,
    filename: row.filename,
    // Number rather than BigInt: JSON.stringify refuses a BigInt outright,
    // and a zip large enough to lose precision here would be unusable anyway.
    size_bytes: Number(row.sizeBytes),
    includes_images: row.includesUploads,
    status: row.status,
    error: row.status === "failed" ? GENERIC_FAILURE : null,
    created_by: row.createdBy,
    created_at: row.createdAt.toISOString(),
    created_by_name: row.author?.fullName ?? null,
  };
}

// GET /api/exports
export const list = async (req: Request, res: Response) => {
  try {
    const exports = await prisma.backup.findMany({
      where: { workspaceId: workspaceIdOf(req) },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { fullName: true } } },
    });

    res.json(exports.map(toExportResponse));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// POST /api/exports
export const create = async (req: Request, res: Response) => {
  try {
    const { include_images } = (req as ValidatedRequest).valid
      .body as ExportCreateBody;
    const actorId = (req as AuthenticatedRequest).user?.id ?? null;
    const workspaceId = workspaceIdOf(req);

    // One at a time: a second build while the first is running would double
    // the memory for the same answer, and the workshop has nothing to do
    // with two copies.
    //
    // Bounded by age, because a build has no supervisor: if the process dies
    // mid-way — a deploy, a crash — its row stays pending forever, and an
    // unbounded check would lock the workshop out of exporting with no way
    // back. Anything this old is not running.
    const running = await prisma.backup.findFirst({
      where: {
        workspaceId,
        status: "pending",
        createdAt: { gt: new Date(Date.now() - STALE_AFTER_MS) },
      },
      select: { id: true },
    });

    if (running) {
      return res.status(409).json({
        error: "یک خروجی در حال ساخت است. تا پایان آن صبر کنید",
      });
    }

    const created = await prisma.backup.create({
      data: {
        workspaceId,
        filename: `export-${Date.now()}.zip`,
        includesUploads: include_images,
        status: "pending",
        createdBy: actorId,
      },
      include: { author: { select: { fullName: true } } },
    });

    // 202, not 201: the row exists but the file does not yet. The client
    // polls the list until this row turns ready.
    res.status(202).json(toExportResponse(created));

    // After the response, deliberately. A workshop with a thousand devices
    // takes minutes to export, which is longer than any reverse proxy will
    // hold a connection open.
    //
    // setImmediate rather than a queue: there is no Redis and no worker, and
    // one process is what this deployment has. If it dies mid-build the row
    // stays pending, which is visible rather than silent.
    setImmediate(() => {
      void buildExport(created.id, workspaceId, include_images);
    });
  } catch (error) {
    // Guarded: the response may already have gone out, and writing to a
    // closed one replaces the real error in the log with a misleading second.
    if (!res.headersSent) {
      res.status(500).json({ error: errorMessage(error) });
    } else {
      console.error("export create error after response:", error);
    }
  }
};

// GET /api/exports/:id/download
export const download = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;

    // findFirst rather than findUnique: the id alone would resolve an export
    // belonging to another workspace.
    const row = await prisma.backup.findFirst({
      where: { id, workspaceId: workspaceIdOf(req) },
      select: { status: true, filepath: true },
    });

    if (!row) {
      return res.status(404).json({ error: "خروجی یافت نشد" });
    }

    if (row.status !== "ready" || !row.filepath) {
      return res.status(409).json({ error: "این خروجی هنوز آماده نیست" });
    }

    // Signed per request, after the row has been scoped by workspace — the
    // same rule every other object follows.
    res.json({ url: await signedUrlFor(row.filepath) });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// DELETE /api/exports/:id
export const remove = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;
    const workspaceId = workspaceIdOf(req);

    const row = await prisma.backup.findFirst({
      where: { id, workspaceId },
      select: { filepath: true, status: true, createdAt: true },
    });

    if (!row) {
      return res.status(404).json({ error: "خروجی یافت نشد" });
    }

    // A pending row can be removed once it is old enough to be dead: without
    // that, a build whose process died leaves the workshop with a row it can
    // neither finish nor delete, and no way to ask for another.
    const stale = row.createdAt.getTime() < Date.now() - STALE_AFTER_MS;

    if (row.status === "pending" && !stale) {
      return res
        .status(409)
        .json({ error: "این خروجی در حال ساخت است و قابل حذف نیست" });
    }

    // Object first, then the row: the reverse leaves an object nothing points
    // at. A failure here is logged rather than thrown, as everywhere else.
    if (row.filepath) {
      await deleteObject(row.filepath);
    }

    await prisma.backup.delete({ where: { id } });

    res.json({ message: "خروجی حذف شد" });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};
