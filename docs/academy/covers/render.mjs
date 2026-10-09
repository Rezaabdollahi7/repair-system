// pnpm covers                 همه‌ی کاورهای covers.json
// pnpm covers tutorials/device-intake
//
// خروجی: out/covers/<section>/<slug>/cover.webp — همان مسیری که مقاله در
// src/content/academy/ لندینگ دارد، پس کپی‌کردن یک پوشه کافی است.
//
// فونت‌ها و لوگو از ریپوی لندینگ خوانده می‌شوند (این ریپو فونت ندارد):
// پیش‌فرض: پوشه‌ی dofixo-landing کنار پوشه‌ی repair-system (دو ریپو کنار هم).
// جای دیگری است؟ LANDING_DIR=/path/to/dofixo-landing pnpm covers

import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { launch } from "../lib/session.mjs";
import { OUT } from "../lib/save.mjs";

const HERE = new URL(".", import.meta.url).pathname;
const LANDING = resolve(process.env.LANDING_DIR ?? join(HERE, "../../../../dofixo-landing"));
const FONTS = join(LANDING, "public/fonts");
const LOGO = join(LANDING, "public/images/logo-128.webp");
if (!existsSync(FONTS) || !existsSync(LOGO)) {
  console.error(`ریپوی لندینگ در ${LANDING} پیدا نشد؛ LANDING_DIR را بدهید.`);
  process.exit(1);
}

const covers = JSON.parse(readFileSync(join(HERE, "covers.json"), "utf8"));
const wanted = process.argv.slice(2);
const todo = wanted.length ? covers.filter((c) => wanted.includes(c.slug)) : covers;
const template = readFileSync(join(HERE, "template.html"), "utf8");
const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  for (const c of todo) {
    const shotFile = join(OUT, "shots", `${c.screenshot}.webp`);
    if (!existsSync(shotFile)) throw new Error(`${c.slug}: اسکرین‌شات ${c.screenshot} نیست؛ اول pnpm shots`);
    const html = template
      .replaceAll("{{FONTS}}", pathToFileURL(FONTS).href)
      .replace("{{LOGO}}", pathToFileURL(LOGO).href)
      .replace("{{SHOT}}", pathToFileURL(shotFile).href)
      .replace("{{POSITION}}", c.position ?? "right top")
      .replace("{{SECTION}}", escape(c.section))
      .replace("{{TITLE}}", escape(c.title))
      // عنوان بلند کوچک‌تر نوشته می‌شود تا در چهار خط جا شود
      .replace("{{SIZE}}", String(c.title.length > 40 ? 46 : c.title.length > 28 ? 52 : 58));
    const tmp = join(OUT, "covers", ".render.html");
    mkdirSync(dirname(tmp), { recursive: true });
    await (await import("node:fs/promises")).writeFile(tmp, html);
    await page.goto(pathToFileURL(tmp).href);
    await page.evaluate(() => document.fonts.ready);
    const file = join(OUT, "covers", c.slug, "cover.webp");
    mkdirSync(dirname(file), { recursive: true });
    await sharp(await page.screenshot()).webp({ quality: 85 }).toFile(file);
    console.log(`  ${file.replace(OUT, "out/")}`);
  }
} finally {
  await browser.close();
}
