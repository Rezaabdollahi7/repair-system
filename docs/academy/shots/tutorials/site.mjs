// تصویرهای صفحه‌ی اول سایت (نه یک آموزش): گالری «اسکرین‌شات‌ها»، تصویر هر
// ماژول در بخش «از پراکندگی به نظم» و تصویر hero.
//
// خروجی out/shots/site/ است و در لندینگ به src/assets/site/ می‌رود. دسکتاپ با
// تراکم دو برابر (VIEWPORTS.retina)، چون در لایت‌باکس تمام‌صفحه باز می‌شود.
// بدون کادر و شماره: این‌ها نمای محصول‌اند، نه قدم آموزش.
//
// hero ترکیب دو عکس است — فهرست دستگاه‌ها در قاب مرورگر و داشبورد در قاب
// گوشی — که از site/hero.html با پس‌زمینه‌ی شفاف گرفته می‌شود.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { session, settle, APP } from "../../lib/session.mjs";
import { shot, OUT } from "../../lib/save.mjs";

const S = "site";
const HERE = new URL("../../site/", import.meta.url).pathname;
const LANDING = resolve(process.env.LANDING_DIR ?? join(HERE, "../../../../dofixo-landing"));

/** صفحه‌هایی که فقط باز می‌شوند و عکس می‌گیرند. */
const PAGES = [
  ["dashboard", "/dashboard"],
  ["devices", "/devices"],
  ["customer-page", "/customers/1"],
  ["items", "/items"],
  ["profit-report", "/reports/profit"],
  ["sms-wallet", "/sms-wallet"],
];

export default async function run(browser) {
  {
    const { context, page } = await session(browser, "retina");
    for (const [name, path] of PAGES) {
      await page.goto(`${APP}${path}`);
      await settle(page);
      await shot(page, `${S}/${name}`, { quality: 85 });
    }

    // فرم ثبت دستگاه، خالی، با نوار پیامک پذیرش
    await page.goto(`${APP}/devices`);
    await settle(page);
    await page.getByRole("button", { name: "ثبت دستگاه جدید" }).first().click();
    await settle(page, 700);
    await shot(page, `${S}/new-device`, { quality: 85 });

    // جزئیات یک فاکتور تعمیر: قطعه و اجرت، پرداخت، گارانتی
    await page.goto(`${APP}/repair-invoices`);
    await settle(page);
    await page.locator("table tbody tr").first().getByRole("button", { name: "جزئیات" }).click();
    await settle(page, 700);
    await shot(page, `${S}/repair-invoice`, { quality: 85 });

    // صفحه‌ی یک تعمیرکار: از فهرست پرسنل، ردیف «علی رضایی»
    await page.goto(`${APP}/personnel`);
    await settle(page);
    await page.locator("table tbody tr").filter({ hasText: "علی رضایی" }).first().locator("td").first().click();
    await page.waitForURL(/\/personnel\/\d+/);
    await settle(page);
    await shot(page, `${S}/technician`, { quality: 85 });
    await context.close();
  }

  {
    const { context, page } = await session(browser, "mobile");
    for (const [name, path] of [["devices-mobile", "/devices"], ["dashboard-mobile", "/dashboard"]]) {
      await page.goto(`${APP}${path}`);
      await settle(page);
      await shot(page, `${S}/${name}`, { quality: 85 });
    }
    await context.close();
  }

  await hero(browser);
}

async function hero(browser) {
  const fonts = join(LANDING, "public/fonts");
  if (!existsSync(fonts)) throw new Error(`ریپوی لندینگ در ${LANDING} پیدا نشد؛ LANDING_DIR را بدهید.`);
  const shots = join(OUT, "shots", S);
  const html = readFileSync(join(HERE, "hero.html"), "utf8")
    .replaceAll("{{FONTS}}", pathToFileURL(fonts).href)
    .replaceAll("{{SHOTS}}", pathToFileURL(shots).href);
  const tmp = join(shots, "hero.html");
  writeFileSync(tmp, html);

  const page = await browser.newPage({ viewport: { width: 1520, height: 1120 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(tmp).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");
  const png = await page.locator("#stage").screenshot({ omitBackground: true });
  const file = join(shots, "hero.webp");
  await sharp(png).webp({ quality: 86, alphaQuality: 90 }).toFile(file);
  console.log(`  ${file.replace(OUT, "out/")}`);
  await page.close();
}
