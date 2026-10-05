// آموزش «پذیرش دستگاه در دوفیکسو» — tutorials/device-intake در لندینگ.
// هر shot() یک قدم آموزش است؛ نام فایل همان نامی است که مقاله به آن ارجاع می‌دهد.

import { session, settle, APP } from "../../lib/session.mjs";
import { mark, clear } from "../../lib/annotate.mjs";
import { shot } from "../../lib/save.mjs";

const T = "device-intake";

export default async function run(browser) {
  const { context, page } = await session(browser, "desktop");

  // ۱. فهرست دستگاه‌ها و دکمه‌ی ثبت دستگاه جدید
  await page.goto(`${APP}/devices`);
  await settle(page);
  const addButton = page.getByRole("button", { name: "ثبت دستگاه جدید" });
  await mark(page, [{ target: addButton, n: 1 }]);
  await shot(page, `${T}/01-devices-list`);
  await clear(page);

  // ۲. فرم خالی
  await addButton.first().click();
  await settle(page, 700);
  await shot(page, `${T}/02-new-device-form`);

  // ۳. مشتری: جستجو با نام یا شماره
  const customer = page.getByPlaceholder("جستجو نام یا شماره...");
  await customer.click();
  await customer.fill("موسوی");
  await settle(page, 600);
  await mark(page, [{ target: customer, n: 1 }]);
  await shot(page, `${T}/03-pick-customer`);
  await clear(page);
  // پیشنهاد اول فهرست. با شماره پیدایش می‌کنیم: جدول پشت فرم همین نام‌ها را دارد،
  // ولی شماره‌ها را با رقم فارسی نشان می‌دهد و فهرست پیشنهاد با رقم لاتین.
  await page.getByText(/^0912345\d{4}$/).first().click();
  await settle(page, 400);

  // ۴. مشخصات دستگاه
  const name = page.getByPlaceholder("مثال: لپ‌تاپ، موبایل");
  const brand = page.getByPlaceholder("مثال: Samsung");
  const model = page.getByPlaceholder("مثال: Galaxy S21");
  await mark(page, [
    { target: name, n: 2 },
    { target: brand, n: 3 },
    { target: model, n: 4 },
  ]);
  await shot(page, `${T}/04-device-details`);
  await clear(page);

  await context.close();
}
