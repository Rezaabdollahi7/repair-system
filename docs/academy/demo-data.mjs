// داده‌ی دموی مرکز آموزش: یک تعمیرگاه موبایل ساختگی، «موبایل‌کده نگین».
//
// از راه خود API وارد می‌شود، نه با SQL، تا موجودی انبار، قیمت تمام‌شده‌ی
// میانگین موزون و شماره‌ی فاکتورها همه از منطق واقعی برنامه بگذرند — همان
// روشی که docs/showcase داشت. تفاوتش: فقط موبایل و تبلت، چون مخاطب مرکز آموزش
// تعمیرگاه موبایل است.
//
// ⚠️ هیچ داده‌ی واقعی. شماره‌ها عمداً پشت‌سرهم و آشکارا ساختگی‌اند
// (۰۹۱۲۳۴۵۶۷۰۱، ۰۹۱۲۳۴۵۶۷۰۲، …): شماره‌ی تصادفی ممکن است مال یک آدم واقعی
// باشد و در اسکرین‌شاتی که منتشر می‌شود بیاید.
//
// پیش‌نیاز: پایگاه‌داده‌ی تازه، migrate و seed با
//   SEED_ADMIN_USERNAME=09121234567  SEED_ADMIN_PASSWORD=Demo@12345
// و RATE_LIMIT_LOGIN=0 در backend/.env. بعدش fix-dates.sql — README.md.

const API = process.env.API_URL ?? "http://localhost:5001/api";
const ADMIN = { username: "09121234567", password: "Demo@12345" };

// تکرارپذیر: همان seed همیشه همان داده را می‌سازد، پس اسکرین‌شات‌ها بین دو اجرا
// فقط وقتی فرق می‌کنند که UI عوض شده باشد.
let seed = 1405;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const round = (n, step = 100000) => Math.round(n / step) * step;
const TODAY = new Date();
const daysAgo = (d, h = int(9, 19)) => {
  const x = new Date(TODAY);
  x.setUTCDate(x.getUTCDate() - d);
  x.setUTCHours(h - 3, int(0, 59), 0, 0);
  return x.toISOString();
};

let token;
async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const idOf = (r, key) => r.id ?? r[key]?.id;

token = (await call("POST", "/auth/login", ADMIN)).token;

// ── تعمیرگاه ─────────────────────────────────────────────────────────────
await call("PUT", "/settings", {
  company_name: "موبایل‌کده نگین",
  company_address: "اصفهان، خیابان چهارباغ عباسی، پاساژ نگین، طبقه‌ی اول، واحد ۱۲",
  company_phone: "031-30000000",
  default_warranty_months: 3,
  invoice_footer_text: "گارانتی فقط با ارائه‌ی همین فاکتور معتبر است. از اعتماد شما سپاسگزاریم.",
});
await call("PUT", "/personnel/1", { full_name: "حامد نیک‌نام" });

// ── پرسنل ────────────────────────────────────────────────────────────────
let phoneSeq = 0;
const fakePhone = () => `091234567${String(++phoneSeq).padStart(2, "0")}`;

const staff = [
  ["سارا محمدی", 2],
  ["علی رضایی", 3],
  ["محمد حسینی", 3],
  ["امیر کریمی", 3],
];
const techs = [];
for (const [full_name, role_id] of staff) {
  const username = fakePhone();
  const p = await call("POST", "/personnel", { full_name, username, password: "Demo@12345", phone: username, role_id });
  if (role_id === 3) techs.push(idOf(p, "user"));
}

// ── انبار ────────────────────────────────────────────────────────────────
// قیمت‌ها ریال، حدود قیمت بازار در پاییز ۱۴۰۵.
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
  ],
  "مصرفی": [
    ["CN-B7000", "چسب B7000", "عدد", 450000, 10],
    ["CN-FLX", "روغن لحیم فلاکس", "عدد", 850000, 5],
    ["CN-WIR", "سیم لحیم", "متر", 150000, 30],
  ],
};

const items = [];
for (const [cat, list] of Object.entries(catalog)) {
  const c = await call("POST", "/categories", { name: cat });
  for (const [code, name, unit, price, minStock] of list) {
    const it = await call("POST", "/items", { code, name, unit, categoryId: c.id, minStock, sell_price: round(price * 1.35) });
    items.push({ id: idOf(it, "item"), code, name, unit, price, minStock });
  }
}

// ── فاکتورهای خرید ─────────────────────────────────────────────────────
// قیمت خرید هر بار کمی فرق می‌کند تا قیمت تمام‌شده‌ی میانگین موزون واقعاً حرکت
// کند — موضوع یکی از مقاله‌های «تجربه‌ها».
const suppliers = ["بازرگانی موبایل‌پارت", "پخش قطعات الماس", "تامین قطعات سپهر"];
for (const d of [118, 104, 90, 77, 63, 50, 41, 33, 26, 19, 12, 6, 2]) {
  const lines = [];
  const used = new Set();
  for (let i = 0; i < int(3, 6); i++) {
    const it = pick(items);
    if (used.has(it.id)) continue;
    used.add(it.id);
    lines.push({
      item_id: it.id,
      quantity: it.unit === "متر" ? int(20, 50) : it.code.startsWith("ACC") ? int(5, 15) : int(1, it.price > 50000000 ? 2 : 6),
      unit_price: round(it.price * (0.92 + rnd() * 0.16), 10000),
    });
  }
  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  await call("POST", "/purchase-invoices", {
    supplier_name: pick(suppliers),
    invoice_date: daysAgo(d),
    paid_amount: rnd() < 0.7 ? total : round(total * 0.5),
    note: rnd() < 0.3 ? "تسویه‌ی مابقی تا پایان ماه" : null,
    items: lines,
  });
}

async function stockMap() {
  const r = await call("GET", "/items?limit=1000");
  return new Map((r.data ?? r).map((x) => [x.id, x.currentStock ?? x.current_stock ?? 0]));
}

// ── مشتری‌ها ─────────────────────────────────────────────────────────────
// نام خانوادگی نویسنده‌های مرکز آموزش عمداً در این فهرست نیست.
const firstNames = ["مهدی", "زهرا", "حسین", "فاطمه", "محمدرضا", "مریم", "علیرضا", "نرگس", "سعید", "الهام", "پویا", "شیما", "کامران", "لیلا", "بهزاد", "هانیه", "فرهاد", "سمیرا", "مجید", "آزاده"];
const lastNames = ["موسوی", "صادقی", "نوری", "قاسمی", "اکبری", "رحیمی", "طاهری", "کاظمی", "شریفی", "حیدری", "یوسفی", "عباسی", "مرادی", "زارعی"];
const customers = [];
const usedNames = new Set();
while (customers.length < 36) {
  const name = `${pick(firstNames)} ${pick(lastNames)}`;
  if (usedNames.has(name)) continue;
  usedNames.add(name);
  const phone = fakePhone();
  const c = await call("POST", "/customers", { name, phone });
  customers.push({ id: idOf(c, "customer"), name, phone });
}

// ── دستگاه‌ها ────────────────────────────────────────────────────────────
const kinds = [
  ["گوشی موبایل", "Samsung", ["Galaxy A54", "Galaxy A34", "Galaxy S23", "Galaxy A32"], ["صفحه شکسته، تاچ کار نمی‌کند", "شارژ نمی‌گیرد", "خاموش شده و روشن نمی‌شود", "باتری زود خالی می‌شود"], "A"],
  ["گوشی موبایل", "Apple", ["iPhone 13", "iPhone 12", "iPhone 11", "iPhone 14 Pro"], ["صفحه شکسته", "باتری سلامت ۷۲٪، زود خاموش می‌شود", "شارژ نمی‌شود، فلت شارژ", "دوربین پشت تار است", "گلس پشت شکسته"], "I"],
  ["گوشی موبایل", "Xiaomi", ["Redmi Note 13", "Redmi Note 12", "Poco X6"], ["ریستارت مداوم", "صدای مکالمه ضعیف", "صفحه خط افتاده", "آب‌خوردگی"], "X"],
  ["تبلت", "Samsung", ["Galaxy Tab A8", "Galaxy Tab S7"], ["صفحه شکسته", "شارژ نمی‌شود"], "T"],
];

function statusFor(age) {
  if (age > 40) return pick(["delivered", "delivered", "delivered", "delivered", "not_repaired", "unrepairable"]);
  if (age > 14) return pick(["delivered", "delivered", "delivered", "ready_for_pickup", "repaired", "not_repaired"]);
  if (age > 5) return pick(["delivered", "ready_for_pickup", "repairing", "waiting_for_parts", "repaired", "diagnosing"]);
  return pick(["pending", "pending", "diagnosing", "repairing", "waiting_for_parts", "ready_for_pickup"]);
}

const devices = [];
const ages = Array.from({ length: 58 }, () => int(0, 115) * (rnd() < 0.5 ? 0.35 : 1)).sort((a, b) => b - a);
for (const ageF of ages) {
  const age = Math.floor(ageF);
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
    status: "pending",
    description: pick(issues),
    send_sms: false,
  });
  const id = idOf(d, "device");
  await call("PUT", `/devices/${id}`, { status, exit_date: done ? daysAgo(exitAge) : null, send_sms: false });
  if (rnd() < 0.9) await call("PUT", `/devices/${id}/assignments`, { personnel_ids: [pick(techs)] });
  devices.push({ id, age, status, brand, customer, exitAge });
}

// ── فاکتورهای تعمیر ─────────────────────────────────────────────────────
const services = await call("GET", "/services");
const partsFor = (brand) =>
  items.filter((it) =>
    brand === "Apple" ? /IP1|LTN/.test(it.code)
    : brand === "Xiaomi" ? /RN1|PX6|CHG-TC|SPK/.test(it.code)
    : /A54|A34|A32|CHG-TC|SPK/.test(it.code));

for (const d of devices) {
  if (!["delivered", "ready_for_pickup", "repaired"].includes(d.status) || rnd() < 0.1) continue;
  const lines = [{ item_type: "service", name: services[0].name, quantity: 1, unit: "خدمت", unit_price: round(int(8, 35) * 100000) }];
  if (rnd() < 0.3) lines.push({ item_type: "service", name: services[1].name, quantity: 1, unit: "خدمت", unit_price: 1500000 });
  const stock = await stockMap();
  const avail = partsFor(d.brand).filter((x) => (stock.get(x.id) ?? 0) > 0);
  if (avail.length && rnd() < 0.8) {
    const part = pick(avail);
    lines.push({ item_type: "inventory", item_id: part.id, name: part.name, quantity: 1, unit: part.unit, unit_price: round(part.price * 1.35) });
  }
  const inv = await call("POST", "/repair-invoices", {
    device_id: d.id,
    customer_name: d.customer.name,
    customer_phone: d.customer.phone,
    invoice_date: daysAgo(d.exitAge),
    warranty_months: pick([1, 3, 3, 6]),
    technician_id: pick(techs),
    discount_type: rnd() < 0.15 ? "percentage" : null,
    discount_value: rnd() < 0.15 ? 10 : 0,
    items: lines,
  });
  const invId = idOf(inv, "invoice");
  if (d.status === "delivered") {
    await call("PUT", `/repair-invoices/${invId}/status`, { status: "issued" });
    const partial = rnd() < 0.12;
    await call("POST", `/repair-invoices/${invId}/payments`, {
      amount: partial ? round(inv.total_amount * 0.6) : inv.total_amount,
      payment_method: pick(["cash", "card", "card", "transfer"]),
    });
  } else if (rnd() < 0.7) {
    await call("PUT", `/repair-invoices/${invId}/status`, { status: "issued" });
  }
}

// ── فاکتورهای فروش: لوازم جانبی و قطعه ─────────────────────────────────
for (let i = 0; i < 30; i++) {
  const age = Math.floor(int(0, 110) * (rnd() < 0.55 ? 0.3 : 1));
  const stock = await stockMap();
  const avail = items.filter((x) => !x.code.startsWith("CN") && (stock.get(x.id) ?? 0) > 0);
  if (!avail.length) continue;
  const lines = [];
  const used = new Set();
  const accessories = avail.filter((x) => x.code.startsWith("ACC"));
  for (let j = 0; j < int(1, 3); j++) {
    const it = rnd() < 0.7 && accessories.length ? pick(accessories) : pick(avail);
    if (used.has(it.id)) continue;
    used.add(it.id);
    lines.push({ item_type: "inventory", item_id: it.id, quantity: 1, unit_price: round(it.price * 1.3) });
  }
  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const c = rnd() < 0.6 ? pick(customers) : null;
  await call("POST", "/sale-invoices", {
    customer_id: c?.id ?? null,
    customer_name: c ? c.name : "مشتری حضوری",
    invoice_date: daysAgo(age),
    paid_amount: rnd() < 0.85 ? total : round(total * 0.5),
    items: lines,
  });
}

// ── یادداشت خصوصی چند مشتری ─────────────────────────────────────────────
await call("PUT", `/customers/${customers[0].id}/notes`, {
  notes: "مشتری همیشگی — قبل از تعویض قطعه حتماً تماس گرفته شود. ۱۰٪ تخفیف دارد.",
});
await call("PUT", `/customers/${customers[1].id}/notes`, {
  notes: "دیر تسویه می‌کند؛ گوشی را قبل از پرداخت کامل تحویل ندهید.",
});

console.log(JSON.stringify({ techs: techs.length, items: items.length, customers: customers.length, devices: devices.length }));
