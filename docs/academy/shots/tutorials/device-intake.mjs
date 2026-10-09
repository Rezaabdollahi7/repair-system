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

  // ۵. پر کردن مشخصات و سپردن به تعمیرکار
  await name.fill("گوشی موبایل");
  await brand.fill("Samsung");
  await model.fill("Galaxy A54");
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await settle(page, 300);
  const tech = page.getByPlaceholder("جستجو و انتخاب مسئول...");
  await tech.click();
  await tech.fill("علی");
  await settle(page, 500);
  await page.locator(".absolute.z-20").getByText("علی رضایی").first().dispatchEvent("mousedown");
  await page.locator(".absolute.z-20").getByText("علی رضایی").first().click().catch(() => {});
  await settle(page, 400);
  await mark(page, [{ target: tech, n: 1 }]);
  await shot(page, `${T}/05-assign-technician`);
  await clear(page);

  // ۶. ایراد، وضعیت و پیامک پذیرش
  const description = page.getByPlaceholder("توضیحات تعمیرکار ...");
  await description.fill("صفحه شکسته، تاچ قسمت پایین کار نمی‌کند. قاب و دکمه‌ها سالم.");
  // فقط select داخل فرم: جدول پشت فرم هم یک select برای تعداد ردیف دارد
  const status = page.locator("select").filter({ has: page.locator("option", { hasText: "در انتظار بررسی" }) }).first();
  const sms = page.getByText("ارسال پیامک پذیرش به مشتری", { exact: false }).first();
  await mark(page, [
    { target: description, n: 1 },
    { target: status, n: 2 },
    { target: sms, n: 3 },
  ]);
  await shot(page, `${T}/06-description-status-sms`);
  await clear(page);

  // ۷. دکمه‌ی ثبت. عمداً کلیک نمی‌شود: ثبت واقعی داده‌ی دمو را عوض می‌کند و
  // اجرای بعدی شماره‌های دیگری می‌گرفت.
  const submit = page.getByRole("button", { name: "ثبت دستگاه", exact: true });
  await mark(page, [{ target: submit, n: 1 }]);
  await shot(page, `${T}/07-submit`);
  await clear(page);

  // ۸. دستگاه در فهرست، با شماره‌ی پذیرش
  await page.getByRole("button", { name: "انصراف" }).last().click();
  await settle(page, 500);
  await page.mouse.move(700, 880); // نشانگر روی هیچ ردیفی نماند
  const firstRow = page.locator("tbody tr").first();
  await mark(page, [{ target: firstRow.locator("td").first(), n: 1 }]);
  await shot(page, `${T}/08-in-the-list`);
  await clear(page);

  await context.close();
}
