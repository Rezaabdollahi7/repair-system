// یک مرورگر وارد‌شده به workspace دمو.
//
// فرانت باید روی localhost:5173 باشد، نه 127.0.0.1: کوکی refresh با
// SameSite=Strict بین 127.0.0.1 و localhost:5001 فرستاده نمی‌شود و هر صفحه به
// /login برمی‌گردد (docs/showcase/README.md).

import { chromium } from "playwright";

export const APP = process.env.APP_URL ?? "http://localhost:5173";
const ADMIN = { username: "09121234567", password: "Demo@12345" };

/** دو اندازه‌ی ثابت راهنمای نگارش: دسکتاپ ۱۴۴۰ و موبایل ۴۲۰. */
export const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 420, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  // همان دسکتاپ با تراکم دو برابر، برای صفحه‌ی اول سایت: آنجا عکس در لایت‌باکس
  // تمام‌صفحه باز می‌شود و ۱۴۴۰ پیکسل روی صفحه‌ی رتینا تار است.
  retina: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
};

export async function launch() {
  // روی ماشینی که مرورگر Playwright را جای دیگری نصب کرده، CHROMIUM_PATH بدهید.
  return chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
}

export async function session(browser, kind = "desktop") {
  const context = await browser.newContext({ locale: "fa-IR", colorScheme: "light", ...VIEWPORTS[kind] });
  const page = await context.newPage();
  await page.goto(`${APP}/login`);
  await page.fill('input[placeholder="09123456789"]', ADMIN.username);
  await page.fill('input[type="password"]', ADMIN.password);
  await page.press('input[type="password"]', "Enter");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await settle(page);
  return { context, page };
}

/** صبر تا شبکه آرام و انیمیشن‌های framer-motion تمام شوند. */
export async function settle(page, ms = 900) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(ms);
}
