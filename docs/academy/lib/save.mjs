import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";

export const OUT = new URL("../out/", import.meta.url).pathname;

/**
 * عکس از viewport (یا یک ناحیه) به WebP. نام فایل انگلیسی و توصیفی
 * (writing-guide.md): out/shots/<tutorial>/<nn-name>.webp
 */
export async function shot(page, path, { clip, quality = 82 } = {}) {
  const png = await page.screenshot({ clip, animations: "disabled" });
  const file = join(OUT, "shots", `${path}.webp`);
  mkdirSync(dirname(file), { recursive: true });
  await sharp(png).webp({ quality }).toFile(file);
  console.log(`  ${file.replace(OUT, "out/")}`);
  return file;
}
