// آموزش «تنظیمات دوفیکسو» — tutorials/settings در لندینگ.
//
// لوگو، مهر و امضای تعمیرگاه ساختگی «موبایل‌کده نگین» همین‌جا از HTML ساخته و
// در تب «تصاویر» بارگذاری می‌شوند — بارگذاری همان لحظه ذخیره می‌شود، پس این
// تنها قدمی است که داده‌ی دمو را عوض می‌کند. بقیه‌ی تب‌ها فقط پر یا نگاه
// می‌شوند و «ذخیره تنظیمات» زده نمی‌شود.

import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { session, settle, APP } from "../../lib/session.mjs";
import { mark, clear } from "../../lib/annotate.mjs";
import { shot } from "../../lib/save.mjs";

const T = "settings";
const LANDING = resolve(process.env.LANDING_DIR ?? new URL("../../../../../dofixo-landing", import.meta.url).pathname);
const FONTS = pathToFileURL(join(LANDING, "public/fonts")).href;

/** لوگو، مهر و امضای ساختگی، به PNG */
async function brandAssets(browser) {
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.setContent(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
    @font-face { font-family: Y; src: url("${FONTS}/IranYekanX/IRANYekanXFaNum-Bold.woff2"); font-weight: 700; }
    @font-face { font-family: Y; src: url("${FONTS}/IranYekanX/IRANYekanXFaNum-Black.woff2"); font-weight: 900; }
    body { margin: 0; background: transparent; font-family: Y; }
    body > * { margin: 40px; }
    #logo { width: 240px; height: 240px; border-radius: 56px; background: linear-gradient(135deg, #0f766e, #14b8a6); color: #fff;
            display: flex; flex-direction: column; align-items: center; justify-content: center; }
    #logo b { font-size: 120px; font-weight: 900; line-height: 1; }
    #logo span { font-size: 24px; font-weight: 700; margin-top: 8px; }
    #stamp { width: 220px; height: 220px; border-radius: 50%; border: 6px solid #2b4fb8; color: #2b4fb8; display: flex;
             align-items: center; justify-content: center; text-align: center; font-weight: 900; font-size: 26px; line-height: 1.5;
             box-shadow: inset 0 0 0 10px #fff, inset 0 0 0 13px #2b4fb8; transform: rotate(-8deg); }
    #sign { width: 300px; height: 140px; }
  </style></head><body>
    <div id="logo"><b>ن</b><span>موبایل‌کده نگین</span></div>
    <div id="stamp">موبایل‌کده<br>نگین<br><small style="font-size:16px">اصفهان</small></div>
    <svg id="sign" viewBox="0 0 300 140"><path d="M20 95 C 50 30, 80 30, 70 90 S 120 120, 140 60 S 180 20, 190 80 S 230 110, 280 40" fill="none" stroke="#1e293b" stroke-width="5" stroke-linecap="round"/></svg>
  </body></html>`);
  await page.evaluate(() => document.fonts.ready);
  const png = async (id) => ({ name: `${id}.png`, mimeType: "image/png", buffer: await page.locator(`#${id}`).screenshot({ omitBackground: true }) });
  const assets = { logo: await png("logo"), stamp: await png("stamp"), signature: await png("sign") };
  await page.close();
  return assets;
}

export default async function run(browser) {
  const assets = await brandAssets(browser);
  const { context, page } = await session(browser, "desktop");

  // ۱. صفحه‌ی تنظیمات و تب «تنظیمات ظاهری»
  await page.goto(`${APP}/settings`);
  await settle(page);
  await mark(page, [
    { target: page.getByRole("link", { name: "تنظیمات" }), n: 1, pad: 3 },
    { target: page.locator('[aria-label="انتخاب پوسته"]'), n: 2, pad: 4 },
  ]);
  await shot(page, `${T}/01-appearance`);
  await clear(page);

  // ۲. اطلاعات شرکت
  await page.getByRole("button", { name: "اطلاعات شرکت" }).click();
  await settle(page, 500);
  await mark(page, [
    { target: page.locator('input[name="company_name"]'), n: 1 },
    { target: page.locator('input[name="company_phone"]'), n: 2 },
    { target: page.locator('textarea[name="company_address"]'), n: 3 },
    { target: page.getByRole("button", { name: "ذخیره تنظیمات" }), n: 4 },
  ]);
  await shot(page, `${T}/02-company-info`);
  await clear(page);

  // ۳. تصاویر: لوگو، مهر، امضا
  await page.getByRole("button", { name: "تصاویر" }).click();
  await settle(page, 500);
  const inputs = page.locator('input[type="file"]');
  for (const [i, file] of [assets.logo, assets.stamp, assets.signature].entries()) {
    await inputs.nth(i).setInputFiles(file);
    await page.waitForResponse((r) => r.url().includes("/settings/upload/") && r.ok());
    await settle(page, 400);
  }
  // تا پیام‌های «با موفقیت آپلود شد» محو شوند
  await page.waitForTimeout(5000);
  await shot(page, `${T}/03-images`);

  // ۴. پیش‌فرض فاکتور
  await page.getByRole("button", { name: "پیش‌فرض فاکتور" }).click();
  await settle(page, 500);
  await mark(page, [
    { target: page.locator('input[name="default_tax_rate"]'), n: 1 },
    { target: page.locator('input[name="default_warranty_months"]'), n: 2 },
    { target: page.locator('textarea[name="invoice_footer_text"]'), n: 3 },
  ]);
  await shot(page, `${T}/04-invoice-defaults`);
  await clear(page);

  // ۵. قالب فاکتور فروش — بلندتر از یک صفحه است، پس viewport موقتاً بلند می‌شود
  await page.setViewportSize({ width: 1440, height: 1560 });
  await page.getByRole("button", { name: "قالب فاکتور فروش" }).click();
  await settle(page, 500);
  await mark(page, [
    { target: page.locator('select[name="sale_invoice_paper_size"]'), n: 1 },
    { target: page.getByRole("heading", { name: "بخش‌های قابل نمایش" }).locator("xpath=.."), n: 2, pad: 4 },
    { target: page.getByRole("heading", { name: "متون سفارشی" }).locator("xpath=.."), n: 3, pad: 4 },
  ]);
  await shot(page, `${T}/05-sale-template`);
  await clear(page);

  // ۶. نتیجه: پیش‌نمایش چاپ یک فاکتور تعمیر
  await page.goto(`${APP}/repair-invoices`);
  await settle(page);
  await page.locator("table tbody tr").first().getByRole("button", { name: "جزئیات" }).click();
  await settle(page, 700);
  await page.getByRole("button", { name: "چاپ" }).first().click();
  await settle(page, 1500);
  await page.setViewportSize({ width: 1440, height: 1700 });
  await settle(page, 800);
  // فقط خود پنجره‌ی پیش‌نمایش، نه صفحه‌ی تار پشتش
  const box = await page.getByText("پیش‌نمایش فاکتور تعمیر").locator("xpath=ancestor::div[contains(@class,'rounded')][last()]").boundingBox();
  const pad = 24;
  await shot(page, `${T}/06-repair-invoice-print`, {
    clip: { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad },
  });

  await context.close();
}
