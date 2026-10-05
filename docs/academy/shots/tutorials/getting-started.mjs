// آموزش «شروع سریع دوفیکسو» — tutorials/getting-started در لندینگ.
// هیچ چیز ذخیره نمی‌شود: فرم ثبت‌نام و فرم پرسنل پر می‌شوند ولی فرستاده
// نمی‌شوند، و تنظیمات و کیف پول فقط نگاه می‌شوند. شماره‌ی ثبت‌نام همان شماره‌ی
// ساختگی دمو است.

import { session, settle, APP } from "../../lib/session.mjs";
import { mark, clear } from "../../lib/annotate.mjs";
import { shot } from "../../lib/save.mjs";

const T = "getting-started";

export default async function run(browser) {
  // ۱. ثبت‌نام — بدون ورود، در یک context تازه
  {
    const context = await browser.newContext({
      locale: "fa-IR",
      colorScheme: "light",
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await page.goto(`${APP}/register`);
    await settle(page);
    await page.getByPlaceholder("تعمیرگاه رضا").fill("موبایل‌کده نگین");
    await page.getByPlaceholder("09123456789").fill("09121234567");
    await page.locator('input[type="password"]').fill("Demo@12345");
    const submit = page.getByRole("button", { name: "ادامه" });
    await mark(page, [
      { target: page.getByPlaceholder("تعمیرگاه رضا"), n: 1 },
      { target: page.getByPlaceholder("09123456789"), n: 2 },
      { target: page.locator('input[type="password"]'), n: 3 },
      { target: submit, n: 4 },
    ]);
    await shot(page, `${T}/01-register`);
    await context.close();
  }

  const { context, page } = await session(browser, "desktop");

  // ۲. تنظیمات ← اطلاعات شرکت
  await page.goto(`${APP}/settings`);
  await settle(page);
  const gear = page.getByRole("link", { name: "تنظیمات" });
  await page.getByRole("button", { name: "اطلاعات شرکت" }).click();
  await settle(page, 500);
  await mark(page, [
    { target: gear, n: 1, pad: 3 },
    { target: page.getByRole("button", { name: "اطلاعات شرکت" }), n: 2, pad: 3 },
    { target: page.getByRole("heading", { name: "اطلاعات شرکت" }).locator("xpath=.."), n: 3, pad: 2 },
  ]);
  await shot(page, `${T}/02-company-info`);
  await clear(page);

  // ۳. پیش‌فرض فاکتور: گارانتی و متن پایین فاکتور
  await page.getByRole("button", { name: "پیش‌فرض فاکتور" }).click();
  await settle(page, 500);
  await mark(page, [
    { target: page.locator('input[name="default_warranty_months"]'), n: 1 },
    { target: page.locator('textarea[name="invoice_footer_text"]'), n: 2 },
    { target: page.getByRole("button", { name: "ذخیره تنظیمات" }), n: 3 },
  ]);
  await shot(page, `${T}/03-invoice-defaults`);
  await clear(page);

  // ۴. پرسنل ← افزودن پرسنل
  await page.goto(`${APP}/personnel`);
  await settle(page);
  await page.getByRole("button", { name: "افزودن پرسنل" }).first().click();
  await settle(page, 600);
  await page.getByPlaceholder("مثال: علی محمدی").fill("سارا کریمی");
  await page.locator('input[name="username"]').fill("09123456799");
  await page.locator('input[name="password"]').fill("Sara@12345");
  await page.locator('select[name="role_id"]').selectOption({ label: "تکنسین" });
  await mark(page, [
    { target: page.getByPlaceholder("مثال: علی محمدی"), n: 1 },
    { target: page.locator('input[name="username"]'), n: 2 },
    { target: page.locator('input[name="password"]'), n: 3 },
    { target: page.locator('select[name="role_id"]'), n: 4 },
    { target: page.getByRole("button", { name: "ایجاد پرسنل" }), n: 5 },
  ]);
  await shot(page, `${T}/04-add-technician`);
  await clear(page);
  await page.getByRole("button", { name: "انصراف" }).click();
  await settle(page, 400);

  // ۵. کیف پول پیامکی: روشن کردن پیامک و شارژ
  await page.goto(`${APP}/sms-wallet`);
  await settle(page);
  await mark(page, [
    { target: page.getByRole("button", { name: /ارسال پیامک به مشتریان/ }), n: 1, pad: 3 },
    { target: page.getByRole("heading", { name: "شارژ کیف پول پیامکی" }).locator("xpath=.."), n: 2, pad: 2 },
  ]);
  await shot(page, `${T}/05-sms-wallet`);
  await clear(page);

  // ۶. دستگاه‌ها: دکمه‌ی ثبت دستگاه جدید
  await page.goto(`${APP}/devices`);
  await settle(page);
  await page.mouse.move(700, 880);
  await mark(page, [{ target: page.getByRole("button", { name: "ثبت دستگاه جدید" }), n: 1 }]);
  await shot(page, `${T}/06-first-device`);
  await clear(page);

  // ۷. داشبورد
  await page.goto(`${APP}/dashboard`);
  await settle(page, 1500);
  await page.mouse.move(700, 880);
  await shot(page, `${T}/07-dashboard`);
  await context.close();

  // ۸. همان داشبورد روی گوشی
  const mobile = await session(browser, "mobile");
  await mobile.page.goto(`${APP}/dashboard`);
  await settle(mobile.page, 1500);
  // فقط بالای صفحه: عکس عمودی تمام‌قد در مقاله بیش از حد بلند می‌شود
  await shot(mobile.page, `${T}/08-on-phone`, { clip: { x: 0, y: 0, width: 420, height: 600 } });
  await mobile.context.close();
}
