// آموزش «فاکتور تعمیر در دوفیکسو» — tutorials/repair-invoice در لندینگ.
//
// هیچ چیزی ثبت نمی‌شود. فرم فاکتور تازه برای گوشی پذیرش ۵۳ (آیفون ۱۳ در
// حال تعمیر) پر و بسته می‌شود؛ پیش‌فاکتور، تأیید صدور و پرداخت از روی
// فاکتورهای موجود دمو نشان داده می‌شوند — REP-0031 (پیش‌فاکتور) و REP-0028
// (صادرشده با پرداخت ناقص). پنجره‌ی تأیید صدور و فرم پرداخت با «انصراف» بسته
// می‌شوند.

import { session, settle, APP } from "../../lib/session.mjs";
import { mark, clear } from "../../lib/annotate.mjs";
import { shot } from "../../lib/save.mjs";

const T = "repair-invoice";
const DRAFT = /REP-0031|REP-۰۰۳۱/;
const PARTIAL = /REP-0028|REP-۰۰۲۸/;

/** یک گزینه از SearchableSelect: باز کردن، جستجو، انتخاب */
async function pick(page, trigger, query, option) {
  await trigger.click();
  await settle(page, 400);
  await page.getByPlaceholder("جستجو…").last().fill(query);
  await settle(page, 600);
  await page.locator("[role=listbox] [role=option]").filter({ hasText: option }).first().click();
  await settle(page, 400);
}

async function openDetail(page, number) {
  await page.goto(`${APP}/repair-invoices`);
  await settle(page);
  await page.locator("table tbody tr").filter({ hasText: number }).first().locator('button[title="جزئیات"]').click();
  await settle(page, 900);
}

export default async function run(browser) {
  const { context, page } = await session(browser, "desktop");

  // ۱. فهرست فاکتورهای تعمیر
  await page.goto(`${APP}/repair-invoices`);
  await settle(page);
  await mark(page, [
    { target: page.getByRole("button", { name: /فاکتور جدید/ }).first(), n: 1 },
    { target: page.getByRole("group", { name: "فیلتر وضعیت فاکتور" }), n: 2, pad: 4 },
  ]);
  await shot(page, `${T}/01-repair-list`);
  await clear(page);

  // ۲. فاکتور تازه: دستگاه، تعمیرکار، یک قطعه از انبار و اجرت (ثبت نمی‌شود)
  await page.setViewportSize({ width: 1440, height: 1060 });
  await page.getByRole("button", { name: /فاکتور جدید/ }).first().click();
  await settle(page, 800);
  // اولین SearchableSelect فرم؛ نامش پس از انتخاب عوض می‌شود
  const device = page.locator("button[aria-haspopup=listbox]").first();
  await pick(page, device, "سمیرا حیدری", "مدل: iPhone 13");
  await page.locator('select[name="technician_id"]').selectOption({ index: 1 });

  await page.getByRole("button", { name: "از انبار", exact: true }).click();
  await settle(page, 400);
  await pick(page, page.getByRole("button", { name: /جستجوی کالا/ }).first(), "باتری", "باتری آیفون ۱۳");

  await page.getByRole("button", { name: "خدمت", exact: true }).click();
  await settle(page, 400);
  await page.locator("select").filter({ hasText: "انتخاب خدمت" }).selectOption("دستمزد تعمیر");
  await page.getByLabel("قیمت واحد").nth(1).fill("700000");
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await settle(page, 500);

  await mark(page, [
    { target: device, n: 1 },
    { target: page.getByLabel("گارانتی (ماه)"), n: 2 },
    { target: page.getByRole("button", { name: "از انبار", exact: true }).locator("xpath=.."), n: 3, pad: 3 },
    { target: page.getByRole("heading", { name: "محاسبات" }).locator("xpath=.."), n: 4, pad: 2 },
    { target: page.getByRole("button", { name: "ثبت فاکتور تعمیر" }), n: 5 },
  ]);
  await shot(page, `${T}/02-new-repair-invoice`);
  await clear(page);
  await page.getByRole("button", { name: "انصراف" }).click();
  await settle(page, 500);
  await page.setViewportSize({ width: 1440, height: 900 });

  // ۳. پیش‌فاکتور: ویرایش‌پذیر، و «صدور فاکتور»
  await openDetail(page, DRAFT);
  await mark(page, [
    { target: page.locator("span:visible").filter({ hasText: /^پیش‌فاکتور$/ }).last(), n: 1, pad: 3 },
    // دکمه‌ی ردیف جدول پشت پنجره هم «ویرایش» نام دارد، ولی فقط با title
    { target: page.getByRole("button", { name: "ویرایش", exact: true }).filter({ hasText: "ویرایش" }), n: 2 },
    { target: page.getByRole("button", { name: "صدور فاکتور" }), n: 3 },
  ]);
  await shot(page, `${T}/03-draft`);
  await clear(page);

  // ۳ب. پیش‌فاکتور چاپی — عنوانش «پیش‌فاکتور تعمیر» است، نه «فاکتور تعمیر»
  await page.getByRole("button", { name: "چاپ" }).first().click();
  await settle(page, 1500);
  await page.setViewportSize({ width: 1440, height: 1500 });
  await settle(page, 800);
  const sheet = await page.getByText("پیش‌نمایش فاکتور تعمیر").locator("xpath=ancestor::div[contains(@class,'rounded')][last()]").boundingBox();
  await shot(page, `${T}/03-draft-print`, {
    clip: { x: sheet.x - 24, y: sheet.y - 24, width: sheet.width + 48, height: sheet.height + 48 },
  });
  await page.keyboard.press("Escape");
  await settle(page, 500);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDetail(page, DRAFT);

  // ۴. تأیید صدور — با «انصراف» بسته می‌شود
  await page.getByRole("button", { name: "صدور فاکتور" }).click();
  await settle(page, 600);
  await shot(page, `${T}/04-issue-confirm`);
  await page.getByRole("button", { name: "انصراف" }).last().click();
  await settle(page, 500);
  await page.keyboard.press("Escape");
  await settle(page, 400);

  // ۵. فاکتور صادرشده با پرداخت ناقص — پنجره بلندتر از ۹۰۰ است و اسکرولِ
  // داخلش علامت‌ها را جابه‌جا می‌کند، پس viewport بلند می‌شود
  await page.setViewportSize({ width: 1440, height: 1240 });
  await openDetail(page, PARTIAL);
  await mark(page, [
    { target: page.getByRole("heading", { name: "پرداخت", exact: true }).locator("xpath=.."), n: 1, pad: 2 },
    { target: page.getByRole("heading", { name: "تاریخچه پرداخت‌ها" }).locator("xpath=.."), n: 2, pad: 2 },
  ]);
  await shot(page, `${T}/05-partial-payment`);
  await clear(page);

  // ۶. فرم ثبت پرداخت، پر شده با مانده — با «انصراف» بسته می‌شود
  await page.getByRole("button", { name: "ثبت پرداخت" }).click();
  await settle(page, 500);
  await page.getByLabel("مبلغ پرداخت").fill("1670000");
  await page.locator("select").filter({ hasText: "کارت بانکی" }).selectOption("card");
  await settle(page, 400);
  await shot(page, `${T}/06-add-payment`);
  await page.getByRole("button", { name: "انصراف" }).last().click();
  await settle(page, 400);

  await context.close();
}
