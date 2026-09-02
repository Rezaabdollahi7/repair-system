import sharp from "sharp";

/**
 * How an uploaded photo is stored.
 *
 * The numbers come from measuring real repair-shop photographs, not from a
 * rule of thumb: fifteen 48MP phone images (8000x6000) at every combination
 * of five widths and five quality settings. The originals average 7.8MB and
 * the previous profile — format conversion only, quality 92 — produced
 * 3.9MB per image.
 *
 *          q92     q85     q78
 *   full  3.90    2.20    1.42
 *   4000  1.62    0.81    0.48
 *   3400  1.23    0.60    0.36
 *   2800  0.86    0.41    0.24
 *
 * 3400 at q85 was chosen by looking at the output, not the table: below it,
 * the markings on small ICs stop being readable, which is the whole reason
 * these photographs exist. It is 6.5x smaller than what we stored before.
 *
 * Two independent dials, and it matters which does what. Resolution is what
 * lets someone zoom in on a component; quality only controls how hard the
 * pixels are compressed. Going from 92 to 85 halves the file on its own
 * without costing a single pixel, which is why both moved.
 */
export const FULL_MAX_EDGE = 3400;
export const FULL_QUALITY = 85;

/**
 * A copy small enough to show in a grid. The slider and the device modal
 * load every image at once, so without this, opening a modal on two photos
 * costs 1.2MB — and costs it again every time, because a presigned URL is
 * unique per request and nothing the browser caches ever matches.
 *
 * Roughly 25KB each: about 4% more storage for something like a hundredth of
 * the bytes on an ordinary browse.
 */
export const THUMB_MAX_EDGE = 480;
export const THUMB_QUALITY = 75;

/**
 * Converts an uploaded buffer into the two sizes stored for it.
 *
 * `.rotate()` with no argument applies the EXIF orientation tag and then
 * drops it. Without it sharp does neither — it neither turns the pixels nor
 * carries the tag across — so a photo taken with the phone upright is stored
 * sideways. Eleven of fifteen real photographs measured carried a non-default
 * orientation, so this was not a theoretical bug; it was every other picture
 * in the app.
 *
 * Dropping the tag also removes the GPS coordinates the camera wrote into it,
 * which a repair invoice has no business carrying.
 */
export async function processDeviceImage(input: Buffer): Promise<{
  full: Buffer;
  thumbnail: Buffer;
}> {
  // Rotated once and reused: the alternative decodes the same 48-megapixel
  // JPEG twice, and a decode of one costs around 144MB of memory.
  const rotated = await sharp(input).rotate().toBuffer();

  const full = await sharp(rotated)
    .resize({
      width: FULL_MAX_EDGE,
      height: FULL_MAX_EDGE,
      fit: "inside",
      // Enlarging a small photo would invent detail and cost bytes for it.
      withoutEnlargement: true,
    })
    .webp({ quality: FULL_QUALITY })
    .toBuffer();

  const thumbnail = await sharp(rotated)
    .resize({
      width: THUMB_MAX_EDGE,
      height: THUMB_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: THUMB_QUALITY })
    .toBuffer();

  return { full, thumbnail };
}

/**
 * Logos, stamps and signatures.
 *
 * Kept separate from the photo profile: these are line art on an invoice,
 * where a soft edge shows immediately, and they are small to begin with.
 * Quality stays where it was; only the size ceiling and the rotation are new.
 * webp keeps transparency, so a stamp on a clear background survives.
 */
export const SETTINGS_MAX_EDGE = 1200;
export const SETTINGS_QUALITY = 92;

export function processSettingsImage(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({
      width: SETTINGS_MAX_EDGE,
      height: SETTINGS_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: SETTINGS_QUALITY })
    .toBuffer();
}
