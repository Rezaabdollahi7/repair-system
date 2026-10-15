// آموزش «فاکتور فروش در دوفیکسو» — tutorials/sale-invoice در لندینگ.
//
// هیچ چیزی ثبت نمی‌شود. فرم فروش تازه پر و با «انصراف» بسته می‌شود؛ جزئیات و
// چاپ از روی SAL-0025 دمو (پرداخت ناقص) است، و «فروش سریع» صفحه‌ی «شارژر ۲۵
// وات سامسونگ» پر و بسته می‌شود.

import { session, settle, APP } from "../../lib/session.mjs";
import { mark, clear } from "../../lib/annotate.mjs";
import { shot } from "../../lib/save.mjs";

const T = "sale-invoice";
const PARTIAL = /SAL-0025|SAL-۰۰۲۵/;
const CHARGER = "شارژر ۲۵ وات سامسونگ";

/** یک گزینه از SearchableSelect: باز کردن، جستجو، انتخاب */
async function pick(page, trigger, query, option) {
  await trigger.click();
  await settle(page, 400);
  await page.getByPlaceholder("جستجو…").last().fill(query);
  await settle(page, 700);
  await page.locator("[role=listbox] [role=option]").filter({ hasText: option }).first().click();
  await settle(page, 400);
}

export default async function run(browser) {
  const { context, page } = await session(browser, "desktop");

  // ۱. فهرست فاکتورهای فروش
  await page.goto(`${APP}/sale-invoices`);
  await settle(page);
  await mark(page, [
    { target: page.getByRole("button", { name: /فاکتور جدید/ }).first(), n: 1 },
    { target: page.getByRole("group", { name: "فیلتر وضعیت پرداخت" }), n: 2, pad: 4 },
    { target: page.getByRole("button", { name: /فیلترها/ }).first(), n: 3 },
  ]);
  await shot(page, `${T}/01-sale-list`);
  await clear(page);

  // ۲. فاکتور فروش تازه: مشتری، دو کالا از انبار، مبلغ دریافتی (ثبت نمی‌شود)
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: /فاکتور جدید/ }).first().click();
  await settle(page, 800);
  const customer = page.locator("button[aria-haspopup=listbox]").first();
  await pick(page, customer, "مریم یوسفی", "مریم یوسفی");

  const fromStock = page.getByRole("button", { name: "از انبار", exact: true });
  await fromStock.click();
  await settle(page, 400);
  await pick(page, page.locator("button[aria-haspopup=listbox]").last(), "گلس", "گلس محافظ صفحه");
  await page.getByLabel("تعداد", { exact: true }).nth(0).fill("2");
  await fromStock.click();
  await settle(page, 400);
  await pick(page, page.locator("button[aria-haspopup=listbox]").last(), "شارژر", CHARGER);
  const paid = page.getByLabel("مبلغ دریافتی");
  await paid.fill("1130000");
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await settle(page, 500);

  await mark(page, [
    { target: customer, n: 1 },
    { target: page.locator('button[title="ثبت سریع مشتری"]'), n: 2 },
    { target: fromStock.locator("xpath=.."), n: 3, pad: 3 },
    { target: page.getByRole("heading", { name: "خلاصه پرداخت" }).locator("xpath=.."), n: 4, pad: 2 },
    { target: page.getByRole("button", { name: "ثبت فاکتور فروش" }), n: 5 },
  ]);
  await shot(page, `${T}/02-new-sale`);
  await clear(page);
  await page.getByRole("button", { name: "انصراف" }).click();
  await settle(page, 500);

  // ۳. جزئیات فاکتوری با پرداخت ناقص
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${APP}/sale-invoices`);
  await settle(page);
  await page.locator("table tbody tr").filter({ hasText: PARTIAL }).first().locator('button[title="مشاهده جزئیات"]').click();
  await settle(page, 900);
  await mark(page, [
    { target: page.getByRole("heading", { name: "خلاصه پرداخت" }).locator("xpath=.."), n: 1, pad: 2 },
    { target: page.getByRole("button", { name: "چاپ" }).first(), n: 2 },
  ]);
  await shot(page, `${T}/03-sale-detail`);
  await clear(page);

  // ۴. پیش‌نمایش چاپ با قالب تنظیمات (A5 در دمو)
  await page.getByRole("button", { name: "چاپ" }).first().click();
  await settle(page, 1500);
  await page.setViewportSize({ width: 1440, height: 1300 });
  await settle(page, 800);
  const sheet = await page.getByText("پیش‌نمایش فاکتور فروش").locator("xpath=ancestor::div[contains(@class,'rounded')][last()]").boundingBox();
  await shot(page, `${T}/04-sale-print`, {
    clip: { x: sheet.x - 24, y: sheet.y - 24, width: sheet.width + 48, height: sheet.height + 48 },
  });
  await page.keyboard.press("Escape");
  await settle(page, 500);
  await page.setViewportSize({ width: 1440, height: 900 });

  // ۵. فروش سریع از صفحه‌ی کالا (ثبت نمی‌شود)
  await page.goto(`${APP}/items`);
  await settle(page);
  await page.locator("table tbody tr").filter({ hasText: CHARGER }).first().locator("td").nth(1).click();
  await page.waitForURL(/\/items\/\d+/);
  await settle(page);
  await mark(page, [{ target: page.getByRole("button", { name: /فروش سریع/ }), n: 1 }]);
  await shot(page, `${T}/05-quick-sale-button`);
  await clear(page);
  await page.getByRole("button", { name: /فروش سریع/ }).click();
  await settle(page, 600);
  await shot(page, `${T}/06-quick-sale`);
  await page.getByRole("button", { name: "انصراف" }).last().click();
  await settle(page, 400);

  await context.close();
}
