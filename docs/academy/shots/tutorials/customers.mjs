// آموزش «ثبت مشتری در دوفیکسو» — tutorials/customers در لندینگ.
//
// هیچ چیز ذخیره نمی‌شود: فرم مشتری و یادداشت پر می‌شوند ولی فرستاده
// نمی‌شوند. مشتری نمونه‌ی صفحه‌ی مشتری، پرکارترین مشتری دمو است تا دستگاه‌ها،
// خط زمانی و فاکتورهایش خالی نباشد.

import { session, settle, APP } from "../../lib/session.mjs";
import { mark, clear } from "../../lib/annotate.mjs";
import { shot } from "../../lib/save.mjs";

const T = "customers";
const NOTE_PLACEHOLDER = "مثلاً: دیر پرداخت می‌کند — تا تسویه نکرده دستگاه را تحویل ندهید.";

export default async function run(browser) {
  const { context, page } = await session(browser, "desktop");

  // ۱. فهرست مشتریان
  await page.goto(`${APP}/customers`);
  await settle(page);
  const search = page.getByRole("searchbox", { name: "جستجوی مشتری" }).or(page.getByLabel("جستجوی مشتری")).first();
  await mark(page, [
    { target: page.getByRole("button", { name: "افزودن مشتری" }).first(), n: 1 },
    { target: search, n: 2 },
  ]);
  await shot(page, `${T}/01-customer-list`);
  await clear(page);

  // ۲. افزودن مشتری (پر می‌شود، فرستاده نمی‌شود)
  await page.getByRole("button", { name: "افزودن مشتری" }).first().click();
  await settle(page, 600);
  const name = page.getByPlaceholder("نام کامل مشتری");
  const phone = page.locator('[role="dialog"] input, form input').nth(1);
  await name.fill("رضا قاسمی");
  await phone.fill("09123456797");
  await mark(page, [
    { target: name, n: 1 },
    { target: phone, n: 2 },
    { target: page.getByRole("button", { name: "افزودن مشتری" }).last(), n: 3 },
  ]);
  await shot(page, `${T}/02-add-customer`);
  await clear(page);
  await page.keyboard.press("Escape");
  await settle(page, 500);

  // ۳. جستجو
  await page.goto(`${APP}/customers`);
  await settle(page);
  await search.fill("حیدری");
  await settle(page, 900);
  await mark(page, [{ target: search, n: 1 }]);
  await shot(page, `${T}/03-search`);
  await clear(page);

  // پرکارترین مشتری: بیشترین «تعداد دستگاه»
  await search.fill("");
  await settle(page, 900);
  const rows = page.locator("table tbody tr");
  const counts = await rows.evaluateAll((trs) =>
    trs.map((tr) => {
      const text = tr.innerText.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
      const cells = [...tr.querySelectorAll("td")].map((td) => td.innerText.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).trim());
      return { text, n: Math.max(...cells.filter((c) => /^\d{1,2}$/.test(c)).map(Number), 0) };
    }),
  );
  const busiest = counts.reduce((best, c, i) => (c.n > counts[best].n ? i : best), 0);
  await rows.nth(busiest).locator('button[title="مشاهده جزئیات"]').click();
  await page.waitForURL(/\/customers\/\d+/);
  await settle(page);
  const customerUrl = page.url();

  // ۴. صفحه‌ی مشتری: خلاصه و دستگاه‌ها
  await mark(page, [
    { target: page.getByText("کل دستگاه‌ها").locator("xpath=ancestor::div[contains(@class,'grid')][1]"), n: 1, pad: 4 },
    { target: page.getByText("دستگاه‌های مشتری").locator("xpath=ancestor::section[1] | ancestor::div[contains(@class,'rounded')][1]").first(), n: 2, pad: 2 },
  ]);
  await shot(page, `${T}/04-customer-page`);
  await clear(page);

  // ۵. خط زمانی و فاکتورها: صفحه‌ی بلند، viewport موقتاً بلند
  await page.setViewportSize({ width: 1440, height: 2000 });
  await settle(page, 600);
  const history = page.getByText("تاریخچه تعمیرات").first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]");
  const invoices = page.getByText("فاکتورها", { exact: true }).first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]");
  await mark(page, [
    { target: history, n: 1, pad: 2 },
    { target: invoices, n: 2, pad: 2 },
  ]);
  // فقط همین دو بخش، نه کل صفحه
  const top = (await history.boundingBox()).y - 30;
  const bottom = (await invoices.boundingBox()).y + (await invoices.boundingBox()).height + 30;
  await shot(page, `${T}/05-history-invoices`, { clip: { x: 0, y: top, width: 1440, height: bottom - top } });
  await clear(page);

  // ۶. یادداشت داخلی (پر می‌شود، ذخیره نمی‌شود)
  const note = page.getByPlaceholder(NOTE_PLACEHOLDER);
  await note.fill("دو بار دیر تسویه کرده. پیش از تحویل، مانده‌ی فاکتور را بگیرید.");
  await mark(page, [
    { target: note, n: 1 },
    { target: page.getByRole("button", { name: "ذخیره یادداشت" }), n: 2 },
  ]);
  const noteBox = await note.locator("xpath=ancestor::*[contains(@class,'rounded')][1]").boundingBox();
  await shot(page, `${T}/06-private-note`, {
    clip: { x: 0, y: Math.max(0, noteBox.y - 260), width: 1440, height: 900 },
  });
  await clear(page);
  await note.fill("");
  await page.setViewportSize({ width: 1440, height: 900 });

  // ۷. ثبت دستگاه از صفحه‌ی مشتری: مشتری از قبل انتخاب شده
  await page.goto(customerUrl);
  await settle(page);
  await page.getByRole("button", { name: "ثبت دستگاه جدید" }).first().click();
  await settle(page, 700);
  await mark(page, [{ target: page.getByPlaceholder("جستجو نام یا شماره..."), n: 1 }]);
  await shot(page, `${T}/07-new-device-for-customer`);
  await clear(page);
  await context.close();

  // ۸. صفحه‌ی مشتری روی گوشی
  const m = await session(browser, "mobile");
  await m.page.goto(customerUrl);
  await settle(m.page);
  await shot(m.page, `${T}/08-on-phone`, { clip: { x: 0, y: 0, width: 420, height: 760 } });
  await m.context.close();
}
