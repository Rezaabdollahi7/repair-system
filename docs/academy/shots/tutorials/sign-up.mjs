// آموزش «ثبت‌نام در دوفیکسو» — tutorials/sign-up در لندینگ.
//
// هیچ حسابی ساخته نمی‌شود و هیچ پیامکی نمی‌رود. درخواست ارسال کد
// (/api/auth/send-otp) در خود مرورگر با یک پاسخ موفق جواب داده می‌شود، تا فرم
// واقعی به مرحله‌ی کد برود؛ کد هرگز فرستاده نمی‌شود و «ساخت کارگاه» زده
// نمی‌شود. شماره‌ها همان شماره‌های ساختگی دمو هستند.

import { session, settle, APP, VIEWPORTS } from "../../lib/session.mjs";
import { mark, clear } from "../../lib/annotate.mjs";
import { shot } from "../../lib/save.mjs";

const T = "sign-up";

/** context بدون ورود، با ارسال کدِ جعلی در خود مرورگر */
async function loggedOut(browser, kind = "desktop") {
  const context = await browser.newContext({ locale: "fa-IR", colorScheme: "light", ...VIEWPORTS[kind] });
  await context.route("**/api/auth/send-otp", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "کد تأیید فرستاده شد" }) }),
  );
  return { context, page: await context.newPage() };
}

export default async function run(browser) {
  {
    const { context, page } = await loggedOut(browser);

    // ۱. فرم ساخت کارگاه، پرشده
    await page.goto(`${APP}/register`);
    await settle(page);
    const name = page.getByPlaceholder("تعمیرگاه رضا");
    const phone = page.getByPlaceholder("09123456789");
    const password = page.locator('input[type="password"]');
    const referral = page.getByLabel("کد دعوت");
    await name.fill("موبایل‌کده نگین");
    await phone.fill("09121234567");
    await password.fill("Demo@12345");
    await mark(page, [
      { target: name, n: 1 },
      { target: phone, n: 2 },
      { target: password, n: 3 },
      { target: referral, n: 4 },
      { target: page.getByRole("button", { name: "ادامه" }), n: 5 },
    ]);
    await shot(page, `${T}/01-register`);
    await clear(page);

    // ۲. مرحله‌ی کد تأیید
    await page.getByRole("button", { name: "ادامه" }).click();
    await settle(page, 900);
    await mark(page, [
      { target: page.locator('input[aria-label="رقم 1"]').locator("xpath=.."), n: 1, pad: 4 },
      { target: page.getByRole("button", { name: "ویرایش شماره" }), n: 2 },
      { target: page.getByText("ارسال مجدد کد تا"), n: 3 },
    ]);
    await shot(page, `${T}/02-otp`);
    await clear(page);

    // ۵. صفحه‌ی ورود
    await page.goto(`${APP}/login`);
    await settle(page);
    await page.getByPlaceholder("09123456789").fill("09121234567");
    await page.locator('input[type="password"]').fill("Demo@12345");
    await mark(page, [
      { target: page.getByPlaceholder("09123456789"), n: 1 },
      { target: page.locator('input[type="password"]'), n: 2 },
      { target: page.getByRole("link", { name: "رمز عبور را فراموش کرده‌اید؟" }), n: 3 },
    ]);
    await shot(page, `${T}/05-login`);
    await clear(page);

    // ۶. فراموشی رمز: شماره و رمز تازه، بعد کد
    await page.goto(`${APP}/forgot-password`);
    await settle(page);
    await page.getByPlaceholder("09123456789").fill("09121234567");
    await page.locator('input[type="password"]').fill("Negin@2026");
    await mark(page, [
      { target: page.getByPlaceholder("09123456789"), n: 1 },
      { target: page.locator('input[type="password"]'), n: 2 },
    ]);
    await shot(page, `${T}/06-forgot-password`);
    await clear(page);
    await context.close();
  }

  // ۷. ورود از گوشی
  {
    const { context, page } = await loggedOut(browser, "mobile");
    await page.goto(`${APP}/login`);
    await settle(page);
    await page.getByPlaceholder("09123456789").fill("09121234567");
    await page.locator('input[type="password"]').fill("Demo@12345");
    await shot(page, `${T}/07-login-on-phone`, { clip: { x: 0, y: 0, width: 420, height: 700 } });
    await context.close();
  }

  // ۳ و ۴. بعد از ورود: نشان دوره‌ی آزمایشی و صفحه‌ی اشتراک
  {
    const { context, page } = await session(browser, "desktop");
    await page.goto(`${APP}/devices`);
    await settle(page);
    await mark(page, [{ target: page.getByText(/آزمایشی/).first(), n: 1, pad: 4 }]);
    await shot(page, `${T}/03-trial-badge`);
    await clear(page);

    await page.goto(`${APP}/subscription`);
    await settle(page);
    await shot(page, `${T}/04-subscription`);
    await context.close();
  }
}
