// pnpm downloads
//
// فایل‌های قابل دانلود مرکز آموزش — فرم‌هایی که خواننده چاپ می‌کند — از HTML
// همین پوشه به PDF. خروجی: out/downloads/<name>.pdf، که در لندینگ به
// public/downloads/ کپی می‌شود و از www.dofixo.ir/downloads/<name>.pdf سرو
// می‌شود.
//
// پیش‌نمایش هر فرم هم به out/shots/downloads/ می‌رود: تصویر مقاله و کاورش.
//
// فونت از ریپوی لندینگ، مثل کاورها (LANDING_DIR).

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { launch } from "../lib/session.mjs";
import { OUT } from "../lib/save.mjs";

const HERE = new URL(".", import.meta.url).pathname;
const LANDING = resolve(process.env.LANDING_DIR ?? join(HERE, "../../../../dofixo-landing"));
const FONTS = join(LANDING, "public/fonts");
if (!existsSync(FONTS)) {
  console.error(`ریپوی لندینگ در ${LANDING} پیدا نشد؛ LANDING_DIR را بدهید.`);
  process.exit(1);
}

const dir = join(OUT, "downloads");
mkdirSync(dir, { recursive: true });

const browser = await launch();
try {
  // اندازه‌ی A4 در ۹۶dpi، تا پیش‌نمایش همان چیزی باشد که چاپ می‌شود
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1.5 });
  for (const file of readdirSync(HERE).filter((f) => f.endsWith(".html"))) {
    const html = readFileSync(join(HERE, file), "utf8").replaceAll("{{FONTS}}", pathToFileURL(FONTS).href);
    // از مسیر فایل باز می‌شود تا file:// فونت‌ها مجاز باشد
    const tmp = join(dir, file);
    writeFileSync(tmp, html);
    await page.goto(pathToFileURL(tmp).href);
    await page.evaluate(() => document.fonts.ready);
    const pdf = join(dir, file.replace(/\.html$/, ".pdf"));
    await page.pdf({ path: pdf, format: "A4", printBackground: true, preferCSSPageSize: true });
    // پیش‌نمایش برای مقاله و کاور: out/shots/downloads/<name>.webp
    const preview = join(OUT, "shots", "downloads", file.replace(/\.html$/, ".webp"));
    mkdirSync(join(OUT, "shots", "downloads"), { recursive: true });
    await sharp(await page.screenshot()).webp({ quality: 85 }).toFile(preview);
    console.log(`  ${pdf.replace(OUT, "out/")}`);
  }
} finally {
  await browser.close();
}
