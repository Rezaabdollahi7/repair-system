// آموزش «وضعیت دستگاه در دوفیکسو» — tutorials/device-statuses در لندینگ.
// هیچ وضعیتی واقعاً عوض نمی‌شود: «آماده تحویل» و «تحویل داده شده» اول
// می‌پرسند پیامک برود یا نه، و همان پرسش عکس گرفته و با «انصراف» لغو می‌شود.
// اگر پیامک workspace دمو خاموش باشد پرسش نمی‌آید و انتخاب ذخیره می‌شود —
// fix-dates.sql پیامک را روشن می‌کند.

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

  // ۵. «آماده تحویل»: اول می‌پرسد پیامک برود یا نه. از «در حال تعمیر» شروع
  // می‌کنیم تا انتخاب واقعاً یک تغییر وضعیت باشد و پرسش بیاید.
  const repairing = page.getByRole("button", { name: "در حال تعمیر", exact: true }).first();
  await repairing.click();
  await settle(page, 700);
  await page.getByRole("button", { name: "تغییر وضعیت دستگاه" }).first().click();
  await settle(page, 500);
  await page.getByRole("button", { name: /آماده تحویل/ }).last().click();
  await settle(page, 600);
  await mark(page, [
    { target: page.getByRole("button", { name: "بله، ارسال کن" }), n: 1, pad: 4 },
    { target: page.getByRole("button", { name: "خیر، بدون پیامک" }), n: 2, pad: 4 },
  ]);
  await shot(page, `${T}/05-ready-prompt`);
  await clear(page);
  await page.getByRole("button", { name: "انصراف" }).last().click();
  await settle(page, 500);
  await repairing.click(); // برداشتن فیلتر
  await settle(page, 600);

  // ۶. تحویل: همان پرسش، با تاریخ خروج
  await chips.click();
  await settle(page, 700);
  await page.getByRole("button", { name: "تغییر وضعیت دستگاه" }).first().click();
  await settle(page, 500);
  await page.getByRole("button", { name: /تحویل داده شده/ }).last().click();
  await settle(page, 600);
  await mark(page, [
    { target: page.getByRole("button", { name: "بله، ارسال کن" }), n: 1, pad: 4 },
    { target: page.getByRole("button", { name: "خیر، بدون پیامک" }), n: 2, pad: 4 },
  ]);
  await shot(page, `${T}/06-delivery-prompt`);
  await clear(page);
  await page.getByRole("button", { name: "انصراف" }).last().click(); // بدون ذخیره
  await settle(page, 500);

  await context.close();
}
