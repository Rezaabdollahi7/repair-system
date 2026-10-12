// آموزش «تعریف کالا و انبار در دوفیکسو» — tutorials/inventory در لندینگ.
//
// هیچ چیز ذخیره نمی‌شود: فرم کالای جدید پر می‌شود ولی ثبت نمی‌شود. کالای
// نمونه‌ی صفحه‌ی کالا «ال‌سی‌دی آیفون ۱۱» است — قطعه‌ای که هر تعمیرگاه موبایل
// دارد، با چند خرید به قیمت‌های مختلف تا میانگین بها معنا داشته باشد.

import { session, settle, APP } from "../../lib/session.mjs";
import { mark, clear } from "../../lib/annotate.mjs";
import { shot } from "../../lib/save.mjs";

const T = "inventory";
const ITEM = "ال‌سی‌دی آیفون ۱۱";

export default async function run(browser) {
  const { context, page } = await session(browser, "desktop");

  // ۱. فهرست کالاها
  await page.goto(`${APP}/items`);
  await settle(page);
  await mark(page, [
    { target: page.getByRole("button", { name: "کالای جدید" }).first(), n: 1 },
    { target: page.getByRole("button", { name: "دسته‌بندی‌ها" }).first(), n: 2 },
    { target: page.getByRole("button", { name: "کم‌موجود" }).first(), n: 3 },
  ]);
  await shot(page, `${T}/01-items-list`);
  await clear(page);

  // ۲. کالای جدید، پرشده با موجودی اولیه (ثبت نمی‌شود)
  await page.getByRole("button", { name: "کالای جدید" }).first().click();
  await settle(page, 700);
  const code = page.getByPlaceholder("مثلاً: CAP-1000-16");
  const name = page.getByPlaceholder("مثلاً: خازن ۱۰۰۰ میکروفاراد ۱۶ ولت");
  await code.fill("LCD-A54");
  await name.fill("ال‌سی‌دی سامسونگ A54");
  const category = page.locator('select[name="categoryId"]');
  await category.selectOption({ label: "ال‌سی‌دی و تاچ" }).catch(() => {});
  const form = page.locator("form").filter({ has: code });
  // بعد از قیمت فروش، به ترتیب: حداقل موجودی، مقدار موجودی اولیه، بهای هر واحد
  const sell = page.locator('input[name="sellPrice"]');
  const numbers = form.locator('input[inputmode]:not([name="sellPrice"])');
  await sell.fill("4500000");
  await numbers.nth(0).fill("2");
  await numbers.nth(1).fill("3");
  await numbers.nth(2).fill("3200000");
  await mark(page, [
    { target: code, n: 1 },
    { target: name, n: 2 },
    { target: category, n: 3 },
    { target: sell, n: 4 },
    { target: numbers.nth(0), n: 5 },
    { target: numbers.nth(1), n: 6 },
    { target: numbers.nth(2), n: 7 },
  ]);
  await shot(page, `${T}/02-new-item`);
  await clear(page);
  await page.keyboard.press("Escape");
  await settle(page, 500);

  // ۳. صفحه‌ی کالا: نمای کلی
  await page.goto(`${APP}/items`);
  await settle(page);
  await page.locator("table tbody tr").filter({ hasText: ITEM }).first().locator("td").nth(1).click();
  await page.waitForURL(/\/items\/\d+/);
  await settle(page);
  const itemUrl = page.url().split("?")[0];
  await mark(page, [
    { target: page.getByText("موجودی", { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'grid')][1]"), n: 1, pad: 4 },
    { target: page.getByRole("tablist").first(), n: 2, pad: 4 },
    { target: page.getByText("عملیات سریع").locator("xpath=ancestor::*[contains(@class,'rounded')][1]"), n: 3, pad: 2 },
  ]);
  await shot(page, `${T}/03-item-page`);
  await clear(page);

  // ۴. کاردکس
  await page.goto(`${itemUrl}?tab=kardex`);
  await settle(page);
  await shot(page, `${T}/04-kardex`);

  // ۵. قیمت‌ها
  await page.goto(`${itemUrl}?tab=prices`);
  await settle(page);
  await shot(page, `${T}/05-prices`);

  // ۶. کم‌موجودها: فیلتر «کم‌موجود» فهرست کالاها
  await page.goto(`${APP}/items`);
  await settle(page);
  await page.getByRole("button", { name: "کم‌موجود" }).first().click();
  await settle(page, 800);
  await mark(page, [{ target: page.getByRole("button", { name: "کم‌موجود" }).first(), n: 1 }]);
  await shot(page, `${T}/06-low-stock`);
  await clear(page);

  // ۷. انبارها
  await page.goto(`${APP}/warehouses`);
  await settle(page);
  await mark(page, [{ target: page.getByRole("button", { name: "انبار جدید" }).first(), n: 1 }]);
  await shot(page, `${T}/07-warehouses`);
  await clear(page);

  await context.close();
}
