// نمای کلی هر صفحه‌ی اصلی، بدون علامت. برای کاور مقاله‌ها و آموزش «شروع سریع».

import { session, settle, APP } from "../../lib/session.mjs";
import { shot } from "../../lib/save.mjs";

const PAGES = [
  ["dashboard", "/dashboard"],
  ["devices", "/devices"],
  ["customers", "/customers"],
  ["customer-page", "/customers/1"],
  ["personnel", "/personnel"],
  ["items", "/items"],
  ["purchase-invoices", "/purchase-invoices"],
  ["sale-invoices", "/sale-invoices"],
  ["repair-invoices", "/repair-invoices"],
  ["stock-report", "/reports/stock"],
  ["profit-report", "/reports/profit"],
  ["sms-wallet", "/sms-wallet"],
  ["settings", "/settings"],
];

export default async function run(browser) {
  for (const kind of ["desktop", "mobile"]) {
    const { context, page } = await session(browser, kind);
    for (const [name, path] of PAGES) {
      await page.goto(`${APP}${path}`);
      await settle(page);
      await shot(page, `overview/${name}${kind === "mobile" ? "-mobile" : ""}`);
    }
    await context.close();
  }
}
