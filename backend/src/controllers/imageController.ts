import { randomUUID } from "crypto";
import { Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import prisma from "../lib/prisma";
import {
  deleteObject,
  deleteObjects,
  deviceImageKey,
  putObject,
  signedUrlFor,
} from "../lib/storage";
import { ValidatedRequest } from "../middleware/validate";
import type { IdParam } from "../schemas/common";
import type { ImageParams } from "../schemas/image";
import { workspaceIdOf } from "../utils/workspace";

// memoryStorage because sharp reads the buffer directly and the converted
// result goes straight to object storage — nothing touches disk at any point
// now, which is what makes a rebuilt container harmless.
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

    const workspaceId = workspaceIdOf(req);

    // findFirst rather than findUnique: the id alone would resolve a device
    // belonging to another workspace — and the workspace is what the object
    // key is built from, so getting this wrong would write into someone
    // else's prefix.
    const device = await prisma.device.findFirst({
      where: { id: deviceId, workspaceId },
      select: { id: true },
    });
    if (!device) {
      return res.status(404).json({ error: "دستگاه یافت نشد" });
    }

    if (files.length === 0) {
      return res.status(400).json({ error: "فایلی آپلود نشده" });
    }

    // Names come from randomUUID rather than the row id, so no placeholder row
    // has to be reserved first just to obtain a unique name.
    const highest = await prisma.deviceImage.aggregate({
      where: { deviceId, workspaceId },
      _max: { sortOrder: true },
    });
    let nextSortOrder = (highest._max.sortOrder ?? 0) + 1;

    const inserted = [];

    for (const file of files) {
      const filename = `${randomUUID()}.webp`;
      const key = deviceImageKey(workspaceId, deviceId, filename);

      let converted: Buffer;
      try {
        // Format conversion only — no resize, no rotate. quality 92 is
        // visually lossless while cutting the file size noticeably, which
        // matters more now that every view costs bandwidth twice: once to
        // upload, once for each viewer to fetch.
        converted = await sharp(file.buffer).webp({ quality: 92 }).toBuffer();
      } catch (conversionError) {
        console.error(
          `خطا در تبدیل عکس ${file.originalname}:`,
          conversionError,
        );
        continue;
      }

      try {
        await putObject(key, converted, "image/webp");
      } catch (uploadError) {
        // Skipped rather than aborting the batch: one failed object shouldn't
        // discard the images that did upload. No row is written, so nothing
        // points at an object that isn't there.
        console.error(`خطا در آپلود ${file.originalname}:`, uploadError);
        continue;
      }

      const image = await prisma.deviceImage.create({
        data: {
          workspaceId,
          deviceId,
          filename,
          // The full object key, not a disk path. Read back and signed as-is
          // rather than rebuilt from workspaceId and deviceId, so a later
          // change to the key layout leaves existing images findable.
          filepath: key,
          sortOrder: nextSortOrder,
        },
      });

      nextSortOrder += 1;

      inserted.push({
        id: image.id,
        device_id: image.deviceId,
        filename: image.filename,
        sort_order: image.sortOrder,
        url: await signedUrlFor(key),
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
      where: { deviceId, workspaceId: workspaceIdOf(req) },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        filename: true,
        filepath: true,
        sortOrder: true,
        createdAt: true,
      },
    });

    // Signed here rather than stored: the URL is a temporary credential, and
    // the rows were already scoped by workspace, so nothing gets signed that
    // the caller wasn't entitled to.
    const withUrls = await Promise.all(
      images.map(async (image) => ({
        id: image.id,
        filename: image.filename,
        sort_order: image.sortOrder,
        created_at: image.createdAt.toISOString(),
        url: await signedUrlFor(image.filepath),
      })),
    );

    res.json(withUrls);
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
      where: { id: imageId, deviceId, workspaceId: workspaceIdOf(req) },
      select: { id: true, filepath: true },
    });

    if (!image) {
      return res.status(404).json({ error: "عکس یافت نشد" });
    }

    // Object first, row second. The other order would risk a row pointing at
    // an object that no longer exists, which shows up as a broken image; this
    // order risks an orphaned object, which nobody sees.
    await deleteObject(image.filepath);
    await prisma.deviceImage.delete({ where: { id: image.id } });

    res.json({ message: "عکس حذف شد" });
  } catch (error) {
    console.error("Delete image error:", error);
    res.status(500).json({ error: "خطا در حذف عکس" });
  }
};

/**
 * Removes every stored object belonging to a device. Called before the device
 * itself is deleted; the deviceImage rows are not removed here because the
 * schema's onDelete: Cascade already handles them.
 */
export const deleteDeviceImages = async (
  deviceId: number,
  workspaceId: number,
): Promise<void> => {
  const images = await prisma.deviceImage.findMany({
    where: { deviceId, workspaceId },
    select: { filepath: true },
  });

  await deleteObjects(images.map((image) => image.filepath));
};
