// آموزش «فاکتور خرید در دوفیکسو» — tutorials/purchase-invoice در لندینگ.
//
// هیچ فاکتوری ثبت نمی‌شود: فرم خرید و «تعریف سریع کالا» پر می‌شوند و بسته
// می‌شوند. اثر خرید روی موجودی و میانگین بها از روی خریدهای قبلی دمو نشان
// داده می‌شود — کاردکس «ال‌سی‌دی آیفون ۱۱» و جزئیات یک فاکتور خرید موجود.

import { session, settle, APP } from "../../lib/session.mjs";
import { mark, clear } from "../../lib/annotate.mjs";
import { shot } from "../../lib/save.mjs";

const T = "purchase-invoice";
const ITEM = "ال‌سی‌دی آیفون ۱۱";

/**
 * ردیف شماره‌ی `index` فرم را پر می‌کند. تنها دکمه‌ی «جستجو و انتخاب کالا»
 * همیشه مال ردیف تازه است — ردیف‌های قبلی به‌جایش نام کالایشان را دارند.
 */
async function fillLine(page, index, itemName, quantity, unitPrice) {
  await page.getByRole("button", { name: /جستجو و انتخاب کالا/ }).first().click();
  await settle(page, 300);
  await page.getByPlaceholder("جستجو…").last().fill(itemName.split(" ").slice(0, 2).join(" "));
  await settle(page, 400);
  await page.getByRole("option").filter({ hasText: itemName }).first().click();
  await settle(page, 300);
  await page.locator('input[inputmode="numeric"]').nth(index).fill(String(quantity));
  await page.locator('input[inputmode="decimal"]:not([name="paid_amount"])').nth(index).fill(String(unitPrice));
}

export default async function run(browser) {
  const { context, page } = await session(browser, "desktop");

  // ۱. فهرست فاکتورهای خرید
  await page.goto(`${APP}/purchase-invoices`);
  await settle(page);
  await mark(page, [
    { target: page.getByRole("button", { name: /فاکتور جدید/ }).first(), n: 1 },
    { target: page.getByLabel("فیلتر وضعیت پرداخت"), n: 2, pad: 4 },
  ]);
  await shot(page, `${T}/01-purchase-list`);
  await clear(page);

  // ۲. فاکتور تازه با دو قطعه و پرداخت ناقص (ثبت نمی‌شود)
  await page.getByRole("button", { name: /فاکتور جدید/ }).first().click();
  await settle(page, 700);
  const supplier = page.locator('input[name="supplier_name"]');
  await supplier.fill("پخش قطعات الماس");
  const add = page.getByRole("button", { name: "افزودن کالا" });
  await add.click();
  await settle(page, 400);
  await fillLine(page, 0, ITEM, 2, 4100000);
  await add.click();
  await settle(page, 400);
  await fillLine(page, 1, "باتری سامسونگ A32", 5, 850000);
  const paid = page.locator('input[name="paid_amount"]');
  await paid.fill("6000000");
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await settle(page, 500);
  await mark(page, [
    { target: supplier, n: 1 },
    { target: add, n: 2 },
    { target: paid, n: 3 },
    { target: page.getByRole("button", { name: "ثبت فاکتور خرید" }), n: 4 },
  ]);
  await shot(page, `${T}/02-new-purchase`);
  await clear(page);

  // ۳. تعریف سریع کالا (پر می‌شود، ثبت نمی‌شود)
  await page.getByRole("button", { name: "تعریف سریع کالا" }).click();
  await settle(page, 600);
  await shot(page, `${T}/03-quick-item`);
  await page.keyboard.press("Escape");
  await settle(page, 300);
  await page.keyboard.press("Escape");
  await settle(page, 500);

  // ۴. جزئیات یک فاکتور خرید موجود
  await page.goto(`${APP}/purchase-invoices`);
  await settle(page);
  await page.locator("table tbody tr").first().locator('button[title="مشاهده جزئیات"]').click();
  await settle(page, 800);
  await shot(page, `${T}/04-purchase-detail`);
  await page.keyboard.press("Escape");
  await settle(page, 400);

  // ۵. اثر خرید: کاردکس و میانگین بهای ال‌سی‌دی
  await page.goto(`${APP}/items`);
  await settle(page);
  await page.locator("table tbody tr").filter({ hasText: ITEM }).first().locator("td").nth(1).click();
  await page.waitForURL(/\/items\/\d+/);
  const itemUrl = page.url().split("?")[0];
  await page.goto(`${itemUrl}?tab=kardex`);
  await settle(page);
  await mark(page, [
    { target: page.getByText("میانگین بها", { exact: false }).first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]"), n: 1, pad: 2 },
    { target: page.locator("table tbody tr").filter({ hasText: "PUR-" }).first(), n: 2, pad: 2 },
  ]);
  await shot(page, `${T}/05-kardex-purchase`);
  await clear(page);

  await context.close();
}
