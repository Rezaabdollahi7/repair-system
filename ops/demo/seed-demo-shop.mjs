#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// ساخت یک کارگاه دمو با داده‌ی کامل — «موبایل‌کده آرتین»
//
// چهار ماه کار یک تعمیرگاه موبایل ساختگی را از راه خود API وارد می‌کند:
// پرسنل، دو انبار، ۲۵ کالا، خرید، انتقال، اصلاح موجودی، انبارگردانی، مشتری،
// دستگاه در همه‌ی وضعیت‌ها، فاکتور تعمیر و فروش و پرداخت. از راه API، نه SQL،
// تا موجودی، میانگین بها و شماره‌ی فاکتورها همه از منطق واقعی برنامه بگذرند —
// همان چیزی که مشتری در ارائه می‌بیند.
//
// استفاده (README.md کنار همین فایل):
//   DOFIXO_API=https://app.dofixo.ir/api \
//   DEMO_PHONE=09xxxxxxxxx DEMO_PASSWORD='...' \
//   node ops/demo/seed-demo-shop.mjs
//
// ⚠️ فقط روی یک کارگاه **خالی و تازه‌ساخته**. اسکریپت قبل از نوشتن چک می‌کند
// که کارگاه هیچ کالا، مشتری، دستگاه یا فاکتوری نداشته باشد و اگر داشت، هیچ
// چیزی نمی‌نویسد — داده‌ی یک کارگاه واقعی را با دمو قاطی نمی‌کند.
//
// ⚠️ هیچ داده‌ی واقعی. شماره‌ی مشتری‌ها در بازه‌ی ساختگی ۰۹۱۲۰۰۰۰۰xx است و
// هیچ پیامکی فرستاده نمی‌شود (send_sms: false، کیف پول خالی).
// ─────────────────────────────────────────────────────────────────────────

import { createInterface } from "node:readline/promises";

// ── تنظیمات ──────────────────────────────────────────────────────────────

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const API = (arg("api") ?? process.env.DOFIXO_API ?? "http://localhost:5001/api").replace(/\/$/, "");
const PHONE = arg("phone") ?? process.env.DEMO_PHONE;
const PASSWORD = arg("password") ?? process.env.DEMO_PASSWORD;
const YES = process.argv.includes("--yes");

if (!PHONE || !PASSWORD) {
  console.error(
    "شماره و رمز حساب دمو لازم است:\n" +
      "  DEMO_PHONE=09xxxxxxxxx DEMO_PASSWORD='...' node ops/demo/seed-demo-shop.mjs\n" +
      "حساب را اول از صفحه‌ی ثبت‌نام اپ بسازید (README.md).",
  );
  process.exit(1);
}

// ── ابزار ────────────────────────────────────────────────────────────────

// تکرارپذیر: همان seed همیشه همان داده را می‌سازد.
let seed = 1405;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const roundTo = (n, step = 10000) => Math.round(n / step) * step;
const TODAY = new Date();
/** یک لحظه در ساعت کاری، `d` روز پیش (به وقت تهران تقریبی). */
const daysAgo = (d, hour = int(9, 19)) => {
  const x = new Date(TODAY);
  x.setUTCDate(x.getUTCDate() - d);
  x.setUTCHours(hour - 3, int(0, 59), 0, 0);
  return x.toISOString();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let token = null;
let requests = 0;

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: PHONE, password: PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`ورود ناموفق (${res.status}): ${body.error ?? ""}`);
  token = body.token;
  return body.user;
}

/**
 * یک درخواست به API. ۴۲۹ (سقف درخواست) را با صبر تا پایان پنجره تکرار
 * می‌کند و ۴۰۱ (توکن پانزده‌دقیقه‌ای منقضی) را با یک ورود دوباره.
 */
async function call(method, path, body, attempt = 0) {
  requests++;
  const res = await fetch(API + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 429 && attempt < 5) {
    const wait = Number(res.headers.get("ratelimit-reset") ?? 60);
    console.log(`  … سقف درخواست؛ ${wait} ثانیه صبر`);
    await sleep((wait + 2) * 1000);
    return call(method, path, body, attempt + 1);
  }
  if (res.status === 401 && attempt < 1) {
    await login();
    return call(method, path, body, attempt + 1);
  }
  const text = await res.text();
  if (!res.ok) {
    const error = new Error(`${method} ${path} → ${res.status} ${text}`);
    error.status = res.status;
    throw error;
  }
  return text ? JSON.parse(text) : null;
}

// Counts in Persian digits; phone numbers stay Latin so they can be pasted
// into the login form as printed.
const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
const step = (title) => console.log(`\n▸ ${title}`);

// ── ورود و بررسی ایمنی ──────────────────────────────────────────────────

const me = await login();
const userId = me?.id;
const settingsNow = await call("GET", "/settings").catch(() => ({}));

const totals = {};
for (const [name, path] of [
  ["کالا", "/items?limit=1"],
  ["مشتری", "/customers?limit=1"],
  ["دستگاه", "/devices?limit=1"],
  ["فاکتور خرید", "/purchase-invoices?limit=1"],
  ["فاکتور فروش", "/sale-invoices?limit=1"],
]) {
  const r = await call("GET", path);
  totals[name] = r?.total ?? r?.pagination?.total ?? (Array.isArray(r?.data) ? r.data.length : 0);
}
const busy = Object.entries(totals).filter(([, n]) => n > 0);

console.log(`سرور:   ${API}`);
console.log(`حساب:   ${PHONE}  (کاربر ${userId ?? "?"})`);
console.log(`کارگاه: ${settingsNow?.company_name ?? "—"}`);
if (busy.length) {
  console.error(
    `\n✋ این کارگاه خالی نیست (${busy.map(([n, c]) => `${c} ${n}`).join("، ")}).` +
      "\nاسکریپت فقط روی یک کارگاه تازه‌ساخته اجرا می‌شود تا داده‌ی دمو با داده‌ی واقعی قاطی نشود." +
      "\nیک حساب تازه از صفحه‌ی ثبت‌نام بسازید و دوباره اجرا کنید.",
  );
  process.exit(2);
}

if (!YES) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("\nکارگاه خالی است. داده‌ی دمو ساخته شود؟ (y/N) ");
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log("لغو شد؛ چیزی نوشته نشد.");
    process.exit(0);
  }
}

// ── کارگاه و پرسنل ──────────────────────────────────────────────────────

step("تنظیمات کارگاه");
await call("PUT", "/settings", {
  company_name: "موبایل‌کده آرتین",
  company_address: "تهران، خیابان ولیعصر، بالاتر از میدان ونک، پاساژ آرتین، طبقه‌ی دوم، واحد ۲۱۴",
  company_phone: "021-00000000",
  default_warranty_months: 3,
  invoice_footer_text: "گارانتی فقط با ارائه‌ی همین فاکتور معتبر است. از اعتماد شما سپاسگزاریم.",
});
if (userId) await call("PUT", `/personnel/${userId}`, { full_name: "آرتین رحمانی" });

step("پرسنل");
// نام کاربری پرسنل در کل سامانه یکتاست (شماره موبایل)، پس هر اجرا یک بلوک
// تازه‌ی ساختگی برمی‌دارد و اگر شماره‌ای گرفته بود، شماره‌ی بعدی را.
let staffSeq = (Date.now() % 9000000) + 1000000;
async function addStaff(full_name, role_id) {
  for (let tries = 0; tries < 20; tries++) {
    const username = `0990${String(staffSeq++).padStart(7, "0")}`;
    try {
      const p = await call("POST", "/personnel", {
        full_name,
        username,
        password: PASSWORD,
        phone: username,
        role_id,
      });
      return { id: p.id ?? p.user?.id, username, role: p.role_name ?? p.user?.role_name };
    } catch (error) {
      if (error.status === 409 || /قبلاً|exists|unique/i.test(error.message)) continue;
      throw error;
    }
  }
  throw new Error("شماره‌ی آزاد برای پرسنل پیدا نشد");
}
const admin = await addStaff("سارا محمدی", 2);
const techs = [];
for (const name of ["علی رضایی", "محمد حسینی", "امیر کریمی"]) techs.push(await addStaff(name, 3));
if (techs[0].role && techs[0].role !== "technician") {
  throw new Error(`نقش ۳ در این سرور «${techs[0].role}» است، نه technician`);
}
console.log(`  مدیر: ${admin.username} · تعمیرکارها: ${techs.map((t) => t.username).join("، ")} — رمز همه = رمز حساب دمو`);

// ── انبارها ──────────────────────────────────────────────────────────────

step("انبارها");
const warehouses = await call("GET", "/warehouses");
const MAIN = (warehouses.find((w) => w.is_default) ?? warehouses[0]).id;
const SHOWCASE = (await call("POST", "/warehouses", { name: "ویترین فروشگاه", note: "لوازم جانبی و فروش حضوری" })).id;

// موجودی هر انبار را خود اسکریپت دنبال می‌کند تا هیچ فروشی بیش از موجودی نباشد.
const stock = new Map(); // `${itemId}:${warehouseId}` → مقدار
const qty = (itemId, wh) => stock.get(`${itemId}:${wh}`) ?? 0;
const move = (itemId, wh, delta) => stock.set(`${itemId}:${wh}`, Math.round((qty(itemId, wh) + delta) * 1000) / 1000);

// ── کالاها ───────────────────────────────────────────────────────────────

step("دسته‌بندی‌ها و کالاها");
// قیمت خرید به ریال، حدود بازار پاییز ۱۴۰۵. [کد، نام، واحد، قیمت خرید، حداقل، کسری]
const catalog = {
  "ال‌سی‌دی و تاچ": [
    ["LCD-A54", "ال‌سی‌دی سامسونگ Galaxy A54", "عدد", 38000000, 2],
    ["LCD-A34", "ال‌سی‌دی سامسونگ Galaxy A34", "عدد", 31000000, 2],
    ["LCD-IP13", "ال‌سی‌دی آیفون ۱۳", "عدد", 95000000, 1],
    ["LCD-IP11", "ال‌سی‌دی آیفون ۱۱", "عدد", 42000000, 1],
    ["LCD-RN13", "ال‌سی‌دی شیائومی Redmi Note 13", "عدد", 26000000, 2],
    ["LCD-PX6", "ال‌سی‌دی شیائومی Poco X6", "عدد", 29000000, 1],
  ],
  "باتری": [
    ["BAT-IP12", "باتری آیفون ۱۲", "عدد", 14500000, 3],
    ["BAT-IP13", "باتری آیفون ۱۳", "عدد", 16500000, 2],
    ["BAT-A32", "باتری سامسونگ A32", "عدد", 6800000, 4],
    ["BAT-RN12", "باتری شیائومی Redmi Note 12", "عدد", 6200000, 4],
  ],
  "سوکت و قطعات برد": [
    ["CHG-TC", "برد شارژ تایپ‌سی", "عدد", 2200000, 6],
    ["CHG-LTN", "فلت شارژ لایتنینگ آیفون", "عدد", 4800000, 3],
    ["CAM-IP11", "دوربین پشت آیفون ۱۱", "عدد", 21000000, 1],
    ["SPK-EAR", "اسپیکر مکالمه", "عدد", 900000, 8],
    ["GLS-IP13", "گلس پشت آیفون ۱۳", "عدد", 3500000, 2],
  ],
  "لوازم جانبی": [
    ["ACC-GLS", "گلس محافظ صفحه", "عدد", 600000, 20],
    ["ACC-CBL", "کابل شارژ تایپ‌سی", "عدد", 1100000, 10],
    ["ACC-CHG25", "شارژر ۲۵ وات سامسونگ", "عدد", 7200000, 4],
    ["ACC-CASE", "قاب سیلیکونی", "عدد", 900000, 15],
    ["ACC-HDS", "هندزفری سیمی", "عدد", 1500000, 6],
  ],
  "مصرفی": [
    ["CN-B7000", "چسب B7000", "عدد", 450000, 10],
    ["CN-FLX", "روغن لحیم فلاکس", "عدد", 850000, 5],
    ["CN-WIR", "سیم لحیم", "متر", 150000, 30, true],
    ["CN-PST", "خمیر سیلیکون حرارتی", "گرم", 25000, 100, true],
    ["CN-TAPE", "نوار چسب دوطرفه", "حلقه", 350000, 5],
  ],
};

const items = [];
for (const [categoryName, list] of Object.entries(catalog)) {
  const category = await call("POST", "/categories", { name: categoryName });
  for (const [code, name, unit, price, minStock, isFractional = false] of list) {
    const it = await call("POST", "/items", {
      code,
      name,
      unit,
      categoryId: category.id,
      minStock,
      isFractional,
      sell_price: roundTo(price * 1.35, 10000),
    });
    items.push({ id: it.id, code, name, unit, price, minStock, isFractional, categoryId: category.id, categoryName });
  }
}
const byCode = (code) => items.find((i) => i.code === code);
console.log(`  ${fa(items.length)} کالا در ${fa(Object.keys(catalog).length)} دسته`);

// ── خرید ─────────────────────────────────────────────────────────────────

step("فاکتورهای خرید");
const suppliers = ["بازرگانی موبایل‌پارت", "پخش قطعات الماس", "تامین قطعات سپهر"];
const buyQuantity = (it, opening) => {
  if (it.unit === "متر") return opening ? 60 : int(20, 40);
  if (it.unit === "گرم") return opening ? 500 : int(150, 300);
  if (it.code.startsWith("ACC")) return opening ? int(25, 40) : int(10, 20);
  if (it.code.startsWith("CN")) return opening ? int(12, 20) : int(5, 10);
  if (it.price > 50000000) return opening ? 2 : 1;
  return opening ? int(4, 8) : int(2, 5);
};

async function purchase(day, lines, supplier) {
  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  await call("POST", "/purchase-invoices", {
    supplier_name: supplier,
    invoice_date: daysAgo(day),
    warehouse_id: MAIN,
    paid_amount: rnd() < 0.7 ? total : roundTo(total * 0.5, 100000),
    note: rnd() < 0.25 ? "تسویه‌ی مابقی تا پایان ماه" : null,
    items: lines,
  });
  for (const l of lines) move(l.item_id, MAIN, l.quantity);
}

// خرید اول: همه‌ی کالاها، تا هیچ فروشی پیش از اولین خرید نباشد.
await purchase(
  120,
  items.map((it) => ({ item_id: it.id, quantity: buyQuantity(it, true), unit_price: roundTo(it.price, 10000) })),
  suppliers[0],
);
// سیزده خرید بعدی با قیمت‌های کمی متفاوت، تا میانگین بها واقعاً حرکت کند.
for (const day of [104, 92, 80, 68, 57, 47, 38, 30, 23, 16, 10, 5, 2]) {
  const chosen = new Map();
  const n = int(3, 6);
  while (chosen.size < n) {
    const it = pick(items);
    chosen.set(it.id, {
      item_id: it.id,
      quantity: buyQuantity(it, false),
      unit_price: roundTo(it.price * (0.92 + rnd() * 0.16), 10000),
    });
  }
  await purchase(day, [...chosen.values()], pick(suppliers));
}
console.log("  ۱۴ فاکتور خرید");

// ── انتقال به ویترین ─────────────────────────────────────────────────────

step("انتقال از انبار اصلی به ویترین");
async function transfer(day, lines, description) {
  const ok = lines.filter((l) => qty(l.item_id, MAIN) >= l.quantity && l.quantity > 0);
  if (!ok.length) return;
  await call("POST", "/stock-transfers", {
    from_warehouse_id: MAIN,
    to_warehouse_id: SHOWCASE,
    transferred_at: daysAgo(day),
    description,
    lines: ok,
  });
  for (const l of ok) {
    move(l.item_id, MAIN, -l.quantity);
    move(l.item_id, SHOWCASE, l.quantity);
  }
}
const accessories = items.filter((i) => i.code.startsWith("ACC"));
await transfer(118, accessories.map((it) => ({ item_id: it.id, quantity: Math.floor(qty(it.id, MAIN) * 0.6) })), "چیدمان ویترین");
await transfer(75, accessories.map((it) => ({ item_id: it.id, quantity: Math.min(8, qty(it.id, MAIN)) })), "تکمیل ویترین");
await transfer(28, [...accessories, byCode("BAT-A32"), byCode("BAT-RN12")].map((it) => ({ item_id: it.id, quantity: Math.min(4, qty(it.id, MAIN)) })), "تکمیل ویترین و باتری پرفروش");
console.log("  ۳ سند انتقال");

// ── مشتری‌ها ─────────────────────────────────────────────────────────────

step("مشتری‌ها");
const firstNames = ["مهدی", "زهرا", "حسین", "فاطمه", "محمدرضا", "مریم", "علیرضا", "نرگس", "سعید", "الهام", "پویا", "شیما", "کامران", "لیلا", "بهزاد", "هانیه", "فرهاد", "سمیرا", "مجید", "آزاده", "رضا", "نگار"];
const lastNames = ["موسوی", "صادقی", "نوری", "قاسمی", "اکبری", "رحیمی", "طاهری", "کاظمی", "شریفی", "حیدری", "یوسفی", "عباسی", "مرادی", "زارعی", "جعفری"];
const customers = [];
const usedNames = new Set();
let customerSeq = 0;
while (customers.length < 40) {
  const name = `${pick(firstNames)} ${pick(lastNames)}`;
  if (usedNames.has(name)) continue;
  usedNames.add(name);
  const phone = `091200000${String(++customerSeq).padStart(2, "0")}`;
  const c = await call("POST", "/customers", { name, phone });
  customers.push({ id: c.id ?? c.customer?.id, name, phone });
}
console.log(`  ${fa(customers.length)} مشتری`);

// ── دستگاه‌ها ────────────────────────────────────────────────────────────

step("دستگاه‌ها");
const kinds = [
  ["گوشی موبایل", "Samsung", ["Galaxy A54", "Galaxy A34", "Galaxy S23", "Galaxy A32"], ["صفحه شکسته، تاچ کار نمی‌کند", "شارژ نمی‌گیرد", "خاموش شده و روشن نمی‌شود", "باتری زود خالی می‌شود"], "R"],
  ["گوشی موبایل", "Apple", ["iPhone 13", "iPhone 12", "iPhone 11", "iPhone 14 Pro"], ["صفحه شکسته", "سلامت باتری ۷۲٪، زود خاموش می‌شود", "شارژ نمی‌شود، فلت شارژ", "دوربین پشت تار است", "گلس پشت شکسته"], "F"],
  ["گوشی موبایل", "Xiaomi", ["Redmi Note 13", "Redmi Note 12", "Poco X6"], ["ریستارت مداوم", "صدای مکالمه ضعیف", "صفحه خط افتاده", "آب‌خوردگی"], "M"],
  ["تبلت", "Samsung", ["Galaxy Tab A8", "Galaxy Tab S7"], ["صفحه شکسته", "شارژ نمی‌شود"], "T"],
];
function statusFor(age) {
  if (age > 40) return pick(["delivered", "delivered", "delivered", "delivered", "not_repaired", "unrepairable"]);
  if (age > 14) return pick(["delivered", "delivered", "delivered", "ready_for_pickup", "repaired", "not_repaired"]);
  if (age > 5) return pick(["delivered", "ready_for_pickup", "repairing", "waiting_for_parts", "repaired", "diagnosing"]);
  return pick(["pending", "pending", "diagnosing", "repairing", "waiting_for_parts", "ready_for_pickup"]);
}
const devices = [];
const ages = Array.from({ length: 60 }, () => Math.floor(int(0, 112) * (rnd() < 0.5 ? 0.35 : 1))).sort((a, b) => b - a);
for (const age of ages) {
  const [device_name, brand, models, issues, prefix] = pick(kinds);
  const customer = pick(customers);
  const status = statusFor(age);
  const done = ["delivered", "not_repaired", "unrepairable"].includes(status);
  const exitAge = Math.max(0, age - int(1, 6));
  const d = await call("POST", "/devices", {
    customer_id: customer.id,
    device_name,
    brand,
    model: pick(models),
    serial_number: `${prefix}${int(100000000, 999999999)}`,
    entry_date: daysAgo(age),
    exit_date: done ? daysAgo(exitAge) : null,
    status,
    description: pick(issues),
    send_sms: false,
  });
  const id = d.id ?? d.device?.id;
  if (rnd() < 0.9) await call("PUT", `/devices/${id}/assignments`, { personnel_ids: [pick(techs).id] });
  devices.push({ id, age, status, brand, customer, exitAge });
}
console.log(`  ${fa(devices.length)} دستگاه`);

// ── فاکتورهای تعمیر ─────────────────────────────────────────────────────

step("فاکتورهای تعمیر و پرداخت‌ها");
const services = await call("GET", "/services");
const partsFor = (brand) =>
  items.filter((it) =>
    brand === "Apple" ? /IP1|LTN/.test(it.code) : brand === "Xiaomi" ? /RN1|PX6|CHG-TC|SPK/.test(it.code) : /A54|A34|A32|CHG-TC|SPK/.test(it.code),
  );
let repairCount = 0;
let draftCount = 0;
for (const d of devices) {
  const finished = ["delivered", "ready_for_pickup", "repaired"].includes(d.status);
  const inProgress = ["repairing", "waiting_for_parts"].includes(d.status);
  if (!(finished || (inProgress && rnd() < 0.6)) || rnd() < 0.08) continue;

  const lines = [
    { item_type: "service", name: services[0]?.name ?? "دستمزد تعمیر", quantity: 1, unit: "خدمت", unit_price: roundTo(int(8, 35) * 100000, 100000) },
  ];
  if (services[1] && rnd() < 0.3) lines.push({ item_type: "service", name: services[1].name, quantity: 1, unit: "خدمت", unit_price: 1500000 });
  const part = pick(partsFor(d.brand).filter((p) => qty(p.id, MAIN) > 0).concat([null, null]));
  if (part) lines.push({ item_type: "inventory", item_id: part.id, name: part.name, quantity: 1, unit: part.unit, unit_price: roundTo(part.price * 1.35, 10000) });
  if (rnd() < 0.25) lines.push({ item_type: "inventory", item_id: byCode("CN-PST").id, name: byCode("CN-PST").name, quantity: 2.5, unit: "گرم", unit_price: 40000 });

  const discount = rnd() < 0.15;
  const inv = await call("POST", "/repair-invoices", {
    device_id: d.id,
    customer_name: d.customer.name,
    customer_phone: d.customer.phone,
    invoice_date: daysAgo(finished ? d.exitAge : d.age),
    warehouse_id: MAIN,
    warranty_months: pick([1, 3, 3, 6]),
    technician_id: pick(techs).id,
    discount_type: discount ? "percentage" : null,
    discount_value: discount ? 10 : 0,
    items: lines,
  });
  const invId = inv.id ?? inv.invoice?.id;

  // پیش‌فاکتور قطعه‌ای از قفسه برنمی‌دارد؛ صدور برمی‌دارد.
  const issue = d.status === "delivered" || (finished && rnd() < 0.7);
  if (issue) {
    await call("PUT", `/repair-invoices/${invId}/status`, { status: "issued" });
    for (const l of lines) if (l.item_type === "inventory") move(l.item_id, MAIN, -l.quantity);
    repairCount++;
    if (d.status === "delivered") {
      const partial = rnd() < 0.12;
      await call("POST", `/repair-invoices/${invId}/payments`, {
        amount: partial ? roundTo(inv.total_amount * 0.6, 10000) : inv.total_amount,
        payment_method: pick(["cash", "card", "card", "transfer"]),
      });
    }
  } else {
    draftCount++;
  }
}
console.log(`  ${fa(repairCount)} فاکتور صادرشده، ${fa(draftCount)} پیش‌فاکتور`);

// ── فاکتورهای فروش ──────────────────────────────────────────────────────

step("فاکتورهای فروش");
let saleCount = 0;
for (let i = 0; i < 34; i++) {
  const age = Math.floor(int(0, 112) * (rnd() < 0.55 ? 0.3 : 1));
  // بیشتر فروش‌ها از ویترین؛ قطعه‌ی گران از انبار اصلی.
  const fromShowcase = rnd() < 0.75;
  const wh = fromShowcase ? SHOWCASE : MAIN;
  const pool = items.filter((x) => !x.code.startsWith("CN") && qty(x.id, wh) >= 1 && (fromShowcase || !x.code.startsWith("ACC")));
  if (!pool.length) continue;
  const lines = new Map();
  for (let j = 0; j < int(1, 3); j++) {
    const it = pick(pool);
    if (lines.has(it.id)) continue;
    const n = it.code.startsWith("ACC") && qty(it.id, wh) >= 2 && rnd() < 0.3 ? 2 : 1;
    lines.set(it.id, { item_type: "inventory", item_id: it.id, quantity: n, unit_price: roundTo(it.price * 1.3, 10000) });
  }
  const list = [...lines.values()];
  const total = list.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const c = rnd() < 0.6 ? pick(customers) : null;
  await call("POST", "/sale-invoices", {
    customer_id: c?.id ?? null,
    customer_name: c ? c.name : "مشتری حضوری",
    invoice_date: daysAgo(age),
    warehouse_id: wh,
    paid_amount: rnd() < 0.85 ? total : roundTo(total * 0.5, 10000),
    items: list,
  });
  for (const l of list) move(l.item_id, wh, -l.quantity);
  saleCount++;
}
console.log(`  ${fa(saleCount)} فاکتور فروش`);

// ── اصلاح موجودی ─────────────────────────────────────────────────────────

step("اسناد اصلاح موجودی");
const lcd = byCode("LCD-A34");
if (qty(lcd.id, MAIN) >= 1) {
  await call("POST", "/stock-adjustments", {
    warehouse_id: MAIN,
    adjusted_at: daysAgo(44),
    description: "بازبینی قفسه‌ی ال‌سی‌دی",
    lines: [{ item_id: lcd.id, direction: "out", quantity: 1, reason: "damage", note: "شکست موقع نصب روی دستگاه" }],
  });
  move(lcd.id, MAIN, -1);
}
const cable = byCode("ACC-CBL");
await call("POST", "/stock-adjustments", {
  warehouse_id: SHOWCASE,
  adjusted_at: daysAgo(17),
  description: "شمارش ویترین",
  lines: [{ item_id: cable.id, direction: "in", quantity: 2, reason: "found", note: "زیر پیشخوان پیدا شد" }],
});
move(cable.id, SHOWCASE, 2);
console.log("  ۲ سند اصلاح");

// ── انبارگردانی ─────────────────────────────────────────────────────────

step("انبارگردانی");
// یکی اعمال‌شده روی «باتری» انبار اصلی، با دو اختلاف کوچک.
const batteryCategory = items.find((i) => i.categoryName === "باتری").categoryId;
const applied = await call("POST", "/stock-counts", {
  warehouse_id: MAIN,
  category_id: batteryCategory,
  description: "انبارگردانی ماهانه‌ی باتری‌ها",
});
let diff = 0;
for (const line of applied.lines) {
  const expected = qty(line.item_id, MAIN);
  let counted = expected;
  if (diff < 2 && expected > 1) {
    counted = diff === 0 ? expected - 1 : expected + 1;
    diff++;
  }
  await call("PUT", `/stock-counts/${applied.id}/lines/${line.id}`, { counted_quantity: counted });
  move(line.item_id, MAIN, counted - expected);
}
await call("POST", `/stock-counts/${applied.id}/apply`, { acknowledge_moved: true });

// یکی در حال شمارش روی ویترین، نیمه‌کاره، کور — برای نشان دادن صفحه‌ی شمارش با گوشی.
const draft = await call("POST", "/stock-counts", {
  warehouse_id: SHOWCASE,
  blind: true,
  description: "شمارش ویترین — در حال انجام",
});
for (const line of draft.lines.slice(0, Math.ceil(draft.lines.length / 2))) {
  await call("PUT", `/stock-counts/${draft.id}/lines/${line.id}`, { counted_quantity: qty(line.item_id, SHOWCASE) });
}
console.log("  ۱ انبارگردانی اعمال‌شده، ۱ در حال شمارش (کور)");

// ── یادداشت مشتری‌ها ─────────────────────────────────────────────────────

step("یادداشت داخلی چند مشتری");
await call("PUT", `/customers/${customers[0].id}/notes`, {
  notes: "مشتری همیشگی — قبل از تعویض قطعه حتماً تماس گرفته شود. ۱۰٪ تخفیف دارد.",
});
await call("PUT", `/customers/${customers[1].id}/notes`, {
  notes: "دیر تسویه می‌کند؛ گوشی را قبل از پرداخت کامل تحویل ندهید.",
});

// ── پایان ────────────────────────────────────────────────────────────────

console.log(
  `\n✓ کارگاه دمو آماده است — ${fa(requests)} درخواست.\n` +
    `  ورود: ${PHONE} با همان رمز\n` +
    `  پرسنل (همان رمز): مدیر ${admin.username}، تعمیرکار ${techs.map((t) => t.username).join("، ")}\n` +
    `  ${fa(items.length)} کالا، ۱۴ خرید، ۳ انتقال، ۲ اصلاح، ۲ انبارگردانی، ` +
    `${fa(customers.length)} مشتری، ${fa(devices.length)} دستگاه، ${fa(repairCount + draftCount)} فاکتور تعمیر، ${fa(saleCount)} فاکتور فروش`,
);
