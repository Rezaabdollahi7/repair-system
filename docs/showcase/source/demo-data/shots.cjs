const { chromium } = require("playwright");
const OUT = require("path").resolve(__dirname, "../../screenshots");
const BASE = "http://localhost:5173";
const pages = [
  ["01-dashboard", "/dashboard"],
  ["02-devices", "/devices"],
  ["03-customers", "/customers"],
  ["04-customer-detail", "/customers/1"],
  ["05-personnel", "/personnel"],
  ["06-items", "/items"],
  ["07-purchase-invoices", "/purchase-invoices"],
  ["08-sale-invoices", "/sale-invoices"],
  ["09-repair-invoices", "/repair-invoices"],
  ["10-stock-report", "/reports/stock"],
  ["11-profit-report", "/reports/profit"],
  ["12-transactions-report", "/reports/transactions"],
  ["13-sms-wallet", "/sms-wallet"],
  ["14-subscription", "/subscription"],
  ["15-settings", "/settings"],
  ["16-exports", "/exports"],
  ["17-referral", "/referral"],
];
const only = process.argv[2] ? process.argv[2].split(",") : null;
(async () => {
  const browser = await chromium.launch();
  async function session(opts) {
    const ctx = await browser.newContext({ locale: "fa-IR", deviceScaleFactor: 2, ...opts });
    const page = await ctx.newPage();
    await page.goto(BASE + "/login");
    await page.fill('input[placeholder="09123456789"]', "09121234567");
    await page.fill('input[type="password"]', "Demo@12345");
    await page.press('input[type="password"]', 'Enter');
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
    await page.waitForTimeout(1500);
    return { ctx, page };
  }
  async function shot(page, name, path, full = false) {
    await page.goto(BASE + path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
    console.log("saved", name);
  }
  const { ctx, page } = await session({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  for (const [name, path] of pages) if (!only || only.includes(name)) await shot(page, name, path);
  if (!only) {
    for (const [name, path] of [["18-device-detail", "/devices"], ["19-repair-invoice-detail", "/repair-invoices"], ["19b-sale-invoice-detail", "/sale-invoices"]]) {
      await page.goto(BASE + path); await page.waitForLoadState("networkidle"); await page.waitForTimeout(1000);
      const row = page.locator("tbody tr").nth(name.startsWith("18") ? 6 : 0);
      const btn = row.locator('button[title="جزئیات"], button[title*="مشاهده"]');
      if (await btn.count()) await btn.first().click(); else await row.locator("td").nth(4).click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/${name}.png` }); console.log("saved", name);
    }
  }
  if (!only) {
    await page.goto(BASE + "/devices"); await page.waitForLoadState("networkidle"); await page.waitForTimeout(800);
    await page.getByText("ثبت دستگاه جدید").first().click(); await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/18b-new-device-form.png` }); console.log("saved 18b");
  }
  await ctx.close();
  if (!only) {
    const dark = await session({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
    await shot(dark.page, "20-dashboard-dark", "/dashboard");
    await shot(dark.page, "21-devices-dark", "/devices");
    await shot(dark.page, "22-customer-detail-dark", "/customers/1");
    await dark.ctx.close();
    const mob = await session({ viewport: { width: 420, height: 900 }, colorScheme: "light", isMobile: true, hasTouch: true });
    await shot(mob.page, "30-mobile-dashboard", "/dashboard");
    await shot(mob.page, "31-mobile-devices", "/devices");
    await mob.ctx.close();
    const login = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const lp = await login.newPage();
    await lp.goto(BASE + "/login"); await lp.waitForTimeout(1500);
    await lp.screenshot({ path: `${OUT}/00-login.png` });
  }
  await browser.close();
})();
