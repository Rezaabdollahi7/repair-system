import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import prisma from "../lib/prisma";
import { ValidatedRequest } from "../middleware/validate";
import { serialize } from "../utils/serialize";
import type { IdParam } from "../schemas/common";
import type { ImageParams } from "../schemas/image";

export const DEVICE_UPLOADS_DIR = path.join(__dirname, "../uploads/devices");

fs.mkdirSync(DEVICE_UPLOADS_DIR, { recursive: true });

// memoryStorage because sharp reads the buffer directly — the raw upload never
// needs to touch disk, only the converted webp does.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("فقط فایل تصویری مجاز است"));
    }
    cb(null, true);
  },
});

// POST /api/devices/:id/images
export const uploadImages = async (req: Request, res: Response) => {
  try {
    const { id: deviceId } = (req as ValidatedRequest).valid.params as IdParam;
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      select: { id: true },
    });
    if (!device) {
      return res.status(404).json({ error: "دستگاه یافت نشد" });
    }

    if (files.length === 0) {
      return res.status(400).json({ error: "فایلی آپلود نشده" });
    }

    // Names come from randomUUID rather than the row id, so no placeholder row
    // has to be reserved first just to obtain a unique name. Two concurrent
    // uploads can't collide, and a crash mid-upload leaves an orphaned file
    // rather than a half-written database row.
    const highest = await prisma.deviceImage.aggregate({
      where: { deviceId },
      _max: { sortOrder: true },
    });
    let nextSortOrder = (highest._max.sortOrder ?? 0) + 1;

    const inserted = [];

    for (const file of files) {
      const filename = `${randomUUID()}.webp`;
      const absolutePath = path.join(DEVICE_UPLOADS_DIR, filename);

      try {
        // Format conversion only — no resize, no rotate. quality 92 is
        // visually lossless while cutting the file size noticeably.
        await sharp(file.buffer).webp({ quality: 92 }).toFile(absolutePath);
      } catch (conversionError) {
        console.error(
          `خطا در تبدیل عکس ${file.originalname}:`,
          conversionError,
        );
        continue;
      }

      const image = await prisma.deviceImage.create({
        data: {
          deviceId,
          filename,
          // Stored relative to the uploads root rather than as an absolute
          // path: the old value embedded the host's directory layout, which
          // differs inside the container. Phase 4 replaces this with an
          // object-storage key.
          filepath: path.posix.join("devices", filename),
          sortOrder: nextSortOrder,
        },
      });

      nextSortOrder += 1;

      inserted.push({
        id: image.id,
        device_id: image.deviceId,
        filename: image.filename,
        sort_order: image.sortOrder,
      });
    }

    if (inserted.length === 0) {
      return res.status(500).json({ error: "هیچ عکسی پردازش نشد" });
    }

    res.status(201).json({
      message: `${inserted.length} عکس آپلود شد`,
      images: inserted,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "خطا در آپلود عکس" });
  }
};

// GET /api/devices/:id/images
export const getImages = async (req: Request, res: Response) => {
  try {
    const { id: deviceId } = (req as ValidatedRequest).valid.params as IdParam;

    const images = await prisma.deviceImage.findMany({
      where: { deviceId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        filename: true,
        sortOrder: true,
        createdAt: true,
      },
    });

    res.json(serialize(images));
  } catch (error) {
    console.error("Get images error:", error);
    res.status(500).json({ error: "خطا در دریافت عکس‌ها" });
  }
};

// DELETE /api/devices/:id/images/:imageId
export const deleteImage = async (req: Request, res: Response) => {
  try {
    const { id: deviceId, imageId } = (req as ValidatedRequest).valid
      .params as ImageParams;

    // Scoped by deviceId as well as the image id: the route is nested under a
    // device, so an image belonging to a different one shouldn't be reachable
    // through it.
    const image = await prisma.deviceImage.findFirst({
      where: { id: imageId, deviceId },
      select: { id: true, filename: true },
    });

    if (!image) {
      return res.status(404).json({ error: "عکس یافت نشد" });
    }

    removeFile(image.filename);

    await prisma.deviceImage.delete({ where: { id: image.id } });

    res.json({ message: "عکس حذف شد" });
  } catch (error) {
    console.error("Delete image error:", error);
    res.status(500).json({ error: "خطا در حذف عکس" });
  }
};

/**
 * Deletes an image file from disk. A failure here is logged but not thrown:
 * an orphaned file wastes space, whereas propagating the error would leave the
 * user with a database row they can't remove and a broken image in the UI.
 */
function removeFile(filename: string): void {
  const absolutePath = path.join(DEVICE_UPLOADS_DIR, filename);
  try {
    fs.rmSync(absolutePath, { force: true });
  } catch (error) {
    console.error(`خطا در حذف فایل ${filename}:`, error);
  }
}

/**
 * Removes every image file belonging to a device. Called before the device
 * itself is deleted; the deviceImage rows are not removed here because the
 * schema's onDelete: Cascade already handles them.
 */
export const deleteDeviceImages = async (deviceId: number): Promise<void> => {
  const images = await prisma.deviceImage.findMany({
    where: { deviceId },
    select: { filename: true },
  });

  for (const image of images) {
    removeFile(image.filename);
  }
};
