// آموزش «تعریف تعمیرکار در دوفیکسو» — tutorials/personnel در لندینگ.
//
// هیچ چیز ذخیره نمی‌شود: فرم افزودن و ویرایش پر می‌شوند ولی فرستاده
// نمی‌شوند، و پنجره‌ی غیرفعال‌سازی با «انصراف» بسته می‌شود. نمای تکنسین با ورود
// به حساب ساختگی «علی رضایی» گرفته می‌شود (رمز همه‌ی پرسنل دمو در
// demo-data.mjs).

import { session, settle, APP, VIEWPORTS } from "../../lib/session.mjs";
import { mark, clear } from "../../lib/annotate.mjs";
import { shot } from "../../lib/save.mjs";

const T = "personnel";
const TECH = "علی رضایی";

export default async function run(browser) {
  const { context, page } = await session(browser, "desktop");

  // ۱. فهرست پرسنل
  await page.goto(`${APP}/personnel`);
  await settle(page);
  const techRow = page.locator("table tbody tr").filter({ hasText: TECH }).first();
  // جدول شماره را با رقم فارسی نشان می‌دهد
  const latin = (await techRow.innerText()).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  const techUsername = latin.match(/09\d{9}/)?.[0];
  await mark(page, [{ target: page.getByRole("button", { name: "افزودن پرسنل" }).first(), n: 1 }]);
  await shot(page, `${T}/01-personnel-list`);
  await clear(page);

  // ۲. افزودن یک ادمین (پر می‌شود، فرستاده نمی‌شود)
  await page.getByRole("button", { name: "افزودن پرسنل" }).first().click();
  await settle(page, 600);
  await page.getByPlaceholder("مثال: علی محمدی").fill("مریم احمدی");
  await page.locator('input[name="username"]').fill("09123456798");
  await page.locator('input[name="password"]').fill("Maryam@1405");
  await page.locator('select[name="role_id"]').selectOption({ label: "ادمین" });
  await mark(page, [
    { target: page.getByPlaceholder("مثال: علی محمدی"), n: 1 },
    { target: page.locator('input[name="username"]'), n: 2 },
    { target: page.locator('input[name="password"]'), n: 3 },
    { target: page.getByPlaceholder("اختیاری — مثلاً تلفن ثابت"), n: 4 },
    { target: page.locator('select[name="role_id"]'), n: 5 },
  ]);
  await shot(page, `${T}/02-add-admin`);
  await clear(page);
  await page.keyboard.press("Escape");
  await settle(page, 500);

  // ۴. ویرایش و رمز تازه
  await page.goto(`${APP}/personnel`);
  await settle(page);
  await page.locator("table tbody tr").filter({ hasText: TECH }).first().locator('button[title="ویرایش"]').click();
  await settle(page, 600);
  await mark(page, [{ target: page.getByPlaceholder("برای تغییر رمز وارد کنید"), n: 1 }]);
  await shot(page, `${T}/04-edit-password`);
  await clear(page);
  await page.keyboard.press("Escape");
  await settle(page, 500);

  // ۵. غیرفعال‌سازی (با «انصراف» بسته می‌شود)
  await page.goto(`${APP}/personnel`);
  await settle(page);
  await page.locator("table tbody tr").filter({ hasText: TECH }).first().locator('button[title="غیرفعال‌سازی"]').click();
  await settle(page, 600);
  await mark(page, [{ target: page.getByRole("button", { name: "غیرفعال کن" }), n: 1 }]);
  await shot(page, `${T}/05-deactivate`);
  await clear(page);
  await page.getByRole("button", { name: "انصراف" }).last().click();
  await settle(page, 400);

  // ۶. صفحه‌ی تعمیرکار
  await page.locator("table tbody tr").filter({ hasText: TECH }).first().locator("td").first().click();
  await page.waitForURL(/\/personnel\/\d+/);
  await settle(page);
  await shot(page, `${T}/06-technician-page`);

  // ۷. بار کاری روی داشبورد
  await page.goto(`${APP}/dashboard`);
  await settle(page);
  await mark(page, [{ target: page.getByRole("heading", { name: "بار کاری تعمیرکارها" }).locator("xpath=ancestor::*[self::section or self::div][2]"), n: 1, pad: 2 }]);
  await shot(page, `${T}/07-dashboard-workload`);
  await clear(page);
  await context.close();

  // ۳. آنچه تکنسین می‌بیند: ورود با حساب خود او
  if (!techUsername) throw new Error(`نام کاربری «${TECH}» در فهرست پرسنل پیدا نشد`);
  const tech = await browser.newContext({ locale: "fa-IR", colorScheme: "light", ...VIEWPORTS.desktop });
  const tpage = await tech.newPage();
  await tpage.goto(`${APP}/login`);
  await tpage.fill('input[placeholder="09123456789"]', techUsername);
  await tpage.fill('input[type="password"]', "Demo@12345");
  await tpage.press('input[type="password"]', "Enter");
  await tpage.waitForURL((u) => !u.pathname.startsWith("/login"));
  await settle(tpage);
  await tpage.waitForTimeout(4000); // تا پیام «خوش آمدید!» محو شود
  await mark(tpage, [{ target: tpage.locator("aside nav, aside").first(), n: 1, pad: 0 }]);
  await shot(tpage, `${T}/03-technician-view`);
  await tech.close();
}
