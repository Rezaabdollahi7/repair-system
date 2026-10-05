// آموزش «وضعیت دستگاه در دوفیکسو» — tutorials/device-statuses در لندینگ.
// هیچ وضعیتی واقعاً عوض نمی‌شود: انتخاب «تحویل داده شده» اول می‌پرسد، و همان
// پرسش عکس گرفته و لغو می‌شود. «آماده تحویل» بی‌پرسش ذخیره می‌شود و پیامک
// می‌فرستد، پس فقط در فهرست انتخاب نشان داده می‌شود و کلیک نمی‌شود.

import { session, settle, APP } from "../../lib/session.mjs";
import { mark, clear } from "../../lib/annotate.mjs";
import { shot } from "../../lib/save.mjs";

const T = "device-statuses";

export default async function run(browser) {
  const { context, page } = await session(browser, "desktop");
  await page.goto(`${APP}/devices`);
  await settle(page);
  await page.mouse.move(700, 880);

  // ۱. ردیف وضعیت‌ها بالای فهرست
  const chips = page.getByRole("button", { name: "آماده تحویل", exact: true }).first();
  const chipRow = chips.locator("xpath=..");
  await mark(page, [{ target: chipRow, n: 1, pad: 4 }]);
  await shot(page, `${T}/01-status-chips`);
  await clear(page);

  // ۲. فیلتر «آماده تحویل»: گوشی‌هایی که منتظر صاحبشان‌اند
  await chips.click();
  await settle(page, 700);
  await page.mouse.move(700, 880);
  await mark(page, [{ target: chips, n: 1 }]);
  await shot(page, `${T}/02-filter-ready`);
  await clear(page);
  await chips.click(); // برداشتن فیلتر
  await settle(page, 700);

  // ۳. دکمه‌ی تغییر وضعیت کنار وضعیت هر دستگاه
  const changeButton = page.getByRole("button", { name: "تغییر وضعیت دستگاه" }).first();
  const firstStatus = page.locator("tbody tr").first().locator("td").nth(5);
  await mark(page, [{ target: changeButton, n: 1, pad: 4 }]);
  await shot(page, `${T}/03-change-button`);
  await clear(page);

  // ۴. فهرست وضعیت‌ها، به ترتیب گردش کار
  await changeButton.click();
  await settle(page, 600);
  const ready = page.getByRole("button", { name: /آماده تحویل/ }).last();
  await mark(page, [{ target: ready, n: 1, pad: 3 }]);
  await shot(page, `${T}/04-status-picker`);
  await clear(page);
  await page.getByRole("button", { name: "انصراف" }).last().click();
  await settle(page, 500);

  // ۵. تحویل: اول می‌پرسد پیامک برود یا نه
  await chips.click();
  await settle(page, 700);
  await page.getByRole("button", { name: "تغییر وضعیت دستگاه" }).first().click();
  await settle(page, 500);
  await page.getByRole("button", { name: /تحویل داده شده/ }).last().click();
  await settle(page, 600);
  const yes = page.getByRole("button", { name: "بله، ارسال کن" });
  const no = page.getByRole("button", { name: "خیر، بدون پیامک" });
  await mark(page, [
    { target: yes, n: 1, pad: 4 },
    { target: no, n: 2, pad: 4 },
  ]);
  await shot(page, `${T}/05-delivery-prompt`);
  await clear(page);
  await page.getByRole("button", { name: "انصراف" }).last().click();
  await settle(page, 500);
  await chips.click(); // برداشتن فیلتر «آماده تحویل»
  await settle(page, 600);

  // ۶. «آماده تحویل» با پیامک: از فرم ویرایش دستگاه. فهرست وضعیت‌ها برای این
  // وضعیت پیامکی نمی‌فرستد؛ فرم می‌فرستد و نوارش را نشان می‌دهد.
  const repairing = page.getByRole("button", { name: "در حال تعمیر", exact: true }).first();
  await repairing.click();
  await settle(page, 700);
  await page.locator("tbody tr").first().locator("td").first().click(); // ستون پذیرش؛ نام مشتری لینک صفحه‌ی مشتری است
  await settle(page, 800);
  const statusSelect = page.locator("select").filter({ has: page.locator("option", { hasText: "در انتظار بررسی" }) }).first();
  await statusSelect.selectOption({ label: "آماده تحویل" });
  await settle(page, 400);
  const readySms = page.getByText("ارسال پیامک آماده تحویل به مشتری", { exact: false }).first();
  await mark(page, [
    { target: statusSelect, n: 1 },
    { target: readySms, n: 2, pad: 4 },
  ]);
  await shot(page, `${T}/06-ready-from-form`);
  await clear(page);
  await page.getByRole("button", { name: "انصراف" }).last().click(); // بدون ذخیره

  await context.close();
  void firstStatus;
}
