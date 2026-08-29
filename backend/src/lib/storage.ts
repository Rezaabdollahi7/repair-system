import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET;
const accessKeyId = process.env.S3_ACCESS_KEY;
const secretAccessKey = process.env.S3_SECRET_KEY;

if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
  throw new Error(
    "S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY must all be " +
      "set — the API cannot serve images without them.",
  );
}

// Region is a formality for ArvanCloud: the endpoint decides where the data
// lives. The SDK requires the field regardless.
import { NodeHttpHandler } from "@smithy/node-http-handler";

const s3 = new S3Client({
  region: process.env.S3_REGION ?? "default",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
  // Without these a stalled connection hangs forever: the export builder has
  // no request to time out behind it, so a build could sit in `pending` with
  // nothing to end it. Generous enough that a slow link still finishes.
  requestHandler: new NodeHttpHandler({
    connectionTimeout: 10_000,
    requestTimeout: 60_000,
  }),
});

export const BUCKET = bucket;

/**
 * Fifteen minutes. Long enough that a page stays usable while someone reads
 * it, short enough that a URL copied out of a browser's history or a server
 * log is worthless by the time anyone finds it.
 */
const URL_TTL_SECONDS = 15 * 60;

/**
 * Every key starts with the workspace, so one shop's objects sit under a
 * prefix no other shop's key can reach.
 *
 * Object storage has no row-level security: nothing at the storage layer
 * knows about tenants. The isolation built in phase 2 therefore only extends
 * here if the key itself carries the workspace and the application checks it
 * before signing anything. A flat namespace would leave that wall open.
 */
export function deviceImageKey(
  workspaceId: number,
  deviceId: number,
  filename: string,
): string {
  return `workspaces/${workspaceId}/devices/${deviceId}/${filename}`;
}

/**
 * The thumbnail's key, built beside the full image's rather than derived
 * from it at read time. What is stored on the row is what gets signed —
 * see the note on filepath in CLAUDE.md.
 */
export function deviceThumbnailKey(
  workspaceId: number,
  deviceId: number,
  filename: string,
): string {
  return `workspaces/${workspaceId}/devices/${deviceId}/thumbs/${filename}`;
}

export function settingsImageKey(
  workspaceId: number,
  filename: string,
): string {
  return `workspaces/${workspaceId}/settings/${filename}`;
}

/**
 * Exports live under the same workspace prefix as everything else, so the
 * one rule that keeps shops apart in object storage holds here too.
 */
export function exportKey(workspaceId: number, filename: string): string {
  return `exports/${workspaceId}/${filename}`;
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Explicit rather than inherited from the bucket: an object that
      // silently became public-read would undo the whole scheme, and this
      // makes the intent visible at the call site.
      ACL: "private",
    }),
  );
}

/**
 * A short-lived URL the browser can load directly.
 *
 * Signed per request rather than stored, so revoking access is a matter of
 * not signing again — and nothing in the database is a working credential.
 */
export function signedUrlFor(key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: URL_TTL_SECONDS,
  });
}

/**
 * Reads an object back into memory.
 *
 * Needed by the export builder, which has to put the bytes inside a zip
 * rather than hand the browser a URL. Kept here rather than fetching a
 * signed URL over HTTP: this module is the only one that knows the SDK, and
 * a round trip through a presigned URL would be the same bytes over a longer
 * path.
 */
export async function getObject(key: string): Promise<Buffer> {
  const result = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );

  if (!result.Body) {
    throw new Error(`Object ${key} has no body`);
  }

  // transformToByteArray is the SDK's own helper; it consumes the stream in
  // whichever form the runtime provides.
  const bytes = await result.Body.transformToByteArray();
  return Buffer.from(bytes);
}

/**
 * Deletion failures are logged, not thrown: an orphaned object wastes a few
 * kilobytes, whereas propagating the error would leave the caller with a
 * database row they cannot remove and a broken image on screen.
 */
export async function deleteObject(key: string): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    console.error(`خطا در حذف فایل ${key} از object storage:`, error);
  }
}

/** Same tolerance as deleteObject, in one round trip instead of many. */
export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) {
    return;
  }

  try {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      }),
    );
  } catch (error) {
    console.error(`خطا در حذف ${keys.length} فایل از object storage:`, error);
  }
}
