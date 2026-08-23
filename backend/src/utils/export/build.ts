// archiver 7, not 8: version 8 is ESM-only, which Jest cannot load under the
// backend's CommonJS setup — every suite failed, not just this one — and
// would leave the production build relying on Node's require(esm) support.
import archiver from "archiver";
import prisma from "../../lib/prisma";
import { exportKey, getObject, putObject } from "../../lib/storage";
import { runWithWorkspace } from "../../lib/workspaceContext";
import { buildWorkbook } from "./workbook";

/**
 * How many images are fetched from object storage at once.
 *
 * One at a time makes a thousand-photo export take minutes of pure waiting;
 * all at once opens a thousand sockets and holds every image in memory. Ten
 * keeps the pipe full without either.
 */
const IMAGE_BATCH = 10;

/** Anything beyond this and the zip is a liability rather than a deliverable. */
const MAX_IMAGES = 5000;

/**
 * Collects a workspace's device images into `عکس‌ها/{deviceId}/{filename}`.
 *
 * A failed image is skipped rather than fatal: one object missing from
 * storage should not cost the workshop its whole export, and the operator
 * can see the count in the log.
 */
async function appendImages(archive: archiver.Archiver): Promise<number> {
  const images = await prisma.deviceImage.findMany({
    orderBy: [{ deviceId: "asc" }, { sortOrder: "asc" }],
    select: { deviceId: true, filename: true, filepath: true },
    take: MAX_IMAGES,
  });

  let added = 0;

  for (let i = 0; i < images.length; i += IMAGE_BATCH) {
    const batch = images.slice(i, i + IMAGE_BATCH);

    const fetched = await Promise.all(
      batch.map(async (image) => {
        try {
          return { image, body: await getObject(image.filepath) };
        } catch (error) {
          console.error(`خطا در خواندن ${image.filepath} برای خروجی:`, error);
          return null;
        }
      }),
    );

    for (const result of fetched) {
      if (!result) continue;
      archive.append(result.body, {
        name: `عکس‌ها/${result.image.deviceId}/${result.image.filename}`,
      });
      added += 1;
    }
  }

  return added;
}

/** Buffers the archive rather than streaming it: putObject wants a Buffer. */
function collect(archive: archiver.Archiver): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("error", reject);
    archive.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Builds one export and records the outcome.
 *
 * Runs after its request has answered, so it opens its own workspace context
 * — the store the request held is gone by the time this starts. Everything
 * inside is scoped by the client extension exactly as a request would be.
 *
 * Never throws: there is no caller left to catch it. A failure is written to
 * the row, which is what the workshop and the operator both read.
 */
export async function buildExport(
  exportId: number,
  workspaceId: number,
  includeImages: boolean,
): Promise<void> {
  await runWithWorkspace(workspaceId, async () => {
    try {
      const workbook = await buildWorkbook();

      // Level 6 rather than 9: the images are already webp and compress
      // barely at all, so the extra CPU buys nothing.
      const archive = archiver("zip", { zlib: { level: 6 } });
      const collected = collect(archive);

      archive.append(workbook, { name: "داده.xlsx" });

      if (includeImages) {
        await appendImages(archive);
      }

      await archive.finalize();
      const zip = await collected;

      const key = exportKey(workspaceId, `${Date.now()}-export.zip`);
      await putObject(key, zip, "application/zip");

      await prisma.backup.update({
        where: { id: exportId },
        data: {
          status: "ready",
          filepath: key,
          sizeBytes: BigInt(zip.length),
        },
      });
    } catch (error) {
      console.error(`خطا در ساخت خروجی ${exportId}:`, error);

      // Best effort: if this write fails too, the row stays pending, which
      // still reads as "something went wrong" rather than as success.
      await prisma.backup
        .update({
          where: { id: exportId },
          data: {
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          },
        })
        .catch(() => {});
    }
  });
}
