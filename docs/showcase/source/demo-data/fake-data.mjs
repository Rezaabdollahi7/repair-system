// Fake demo data for Dofixo, injected through the real API so stock,
// moving-average cost and invoice numbering all go through business logic.
const API = "http://localhost:5001/api";
let token;

let seed = 1405;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const round = (n, step = 100000) => Math.round(n / step) * step;
const TODAY = new Date("2026-10-04T09:00:00Z");
const daysAgo = (d, h = int(8, 18)) => {
  const x = new Date(TODAY);
  x.setUTCDate(x.getUTCDate() - d);
  x.setUTCHours(h - 3, int(0, 59), 0, 0);
  return x.toISOString();
};

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const login = await call("POST", "/auth/login", {
  username: "09121234567",
  password: "Demo@12345",
});
token = login.token;

// ── Settings ─────────────────────────────────────────────────────────────
await call("PUT", "/settings", {
  company_name: "تعمیرگاه موبایل و لپ‌تاپ آرین",
  company_address: "تهران، خیابان ولیعصر، پاساژ کامپیوتر پایتخت، طبقه دوم، واحد ۲۱۴",
  company_phone: "021-88776655",
  company_email: "info@arian-repair.ir",
  company_website: "arian-repair.ir",
  default_warranty_months: 3,
  invoice_footer_text: "از اعتماد شما سپاسگزاریم — گارانتی فقط با ارائه فاکتور معتبر است.",
});
await call("PUT", "/personnel/1", { full_name: "رضا عبداللهی" });

// ── Personnel ────────────────────────────────────────────────────────────
const staff = [
  ["سارا محمدی", "09123456781", 2],
  ["علی رضایی", "09123456782", 3],
  ["محمد حسینی", "09123456783", 3],
  ["امیر کریمی", "09123456784", 3],
  ["نگار احمدی", "09123456785", 3],
];
const techs = [];
for (const [full_name, username, role_id] of staff) {
  const p = await call("POST", "/personnel", {
    full_name, username, password: "Demo@12345", phone: username, role_id,
  });
  if (role_id === 3) techs.push(p.id ?? p.user?.id);
}

// ── Categories & items ───────────────────────────────────────────────────
const catalog = {
  "قطعات موبایل": [
    ["MB-LCD-A54", "ال‌سی‌دی سامسونگ Galaxy A54", "عدد", 38000000, 3],
    ["MB-LCD-IP13", "ال‌سی‌دی آیفون 13", "عدد", 95000000, 2],
    ["MB-LCD-RN12", "ال‌سی‌دی شیائومی Redmi Note 12", "عدد", 24000000, 3],
    ["MB-BAT-IP12", "باتری آیفون 12", "عدد", 14500000, 4],
    ["MB-BAT-A32", "باتری سامسونگ A32", "عدد", 6800000, 5],
    ["MB-CHG-TC", "برد شارژ تایپ‌سی", "عدد", 2200000, 6],
    ["MB-CAM-IP11", "دوربین پشت آیفون 11", "عدد", 21000000, 2],
    ["MB-SPK-UNI", "اسپیکر مکالمه", "عدد", 900000, 8],
  ],
  "قطعات لپ‌تاپ": [
    ["LP-KB-ASUS", "کیبورد لپ‌تاپ ایسوس X515", "عدد", 7500000, 2],
    ["LP-SSD-512", "اس‌اس‌دی 512 گیگ NVMe", "عدد", 32000000, 3],
    ["LP-RAM-8", "رم 8 گیگ DDR4 لپ‌تاپی", "عدد", 16500000, 4],
    ["LP-FAN-HP", "فن پردازنده HP Pavilion", "عدد", 4200000, 3],
    ["LP-ADP-65", "آداپتور 65 وات لنوو", "عدد", 9800000, 3],
    ["LP-LCD-156", "پنل نمایشگر 15.6 اینچ FHD", "عدد", 68000000, 1],
  ],
  "لوازم خانگی": [
    ["HA-MB-WM", "برد اصلی ماشین لباسشویی ال‌جی", "عدد", 52000000, 1],
    ["HA-PMP-WM", "پمپ تخلیه لباسشویی", "عدد", 4800000, 3],
    ["HA-THR-RF", "ترموستات یخچال", "عدد", 3200000, 4],
    ["HA-CMP-RF", "کمپرسور یخچال", "عدد", 85000000, 1],
  ],
  "مصرفی و ابزار": [
    ["CN-PST", "خمیر سیلیکون حرارتی", "تیوب", 1200000, 5],
    ["CN-GLU-B7000", "چسب B7000", "عدد", 450000, 10],
    ["CN-FLX", "روغن لحیم فلاکس", "عدد", 850000, 5],
    ["CN-WIR", "سیم لحیم", "متر", 150000, 30],
  ],
};

const items = [];
for (const [cat, list] of Object.entries(catalog)) {
  const c = await call("POST", "/categories", { name: cat });
  for (const [code, name, unit, price, minStock] of list) {
    const it = await call("POST", "/items", {
      code, name, unit, categoryId: c.id, minStock,
      sell_price: round(price * 1.35),
    });
    items.push({ id: it.id ?? it.item?.id, code, name, unit, price, minStock });
  }
}

// ── Purchase invoices (stock in) ─────────────────────────────────────────
const suppliers = [
  "بازرگانی موبایل‌پارت", "پخش قطعات الماس", "فروشگاه لپ‌تاپ‌یار",
  "پخش لوازم یدکی خانگی ایران", "تامین قطعات سپهر",
];
const purchaseDays = [118, 104, 90, 77, 63, 50, 41, 33, 26, 19, 12, 6, 2];
for (const d of purchaseDays) {
  const lines = [];
  const used = new Set();
  for (let i = 0; i < int(3, 6); i++) {
    const it = pick(items);
    if (used.has(it.id)) continue;
    used.add(it.id);
    lines.push({
      item_id: it.id,
      quantity: it.unit === "متر" ? int(20, 50) : int(2, it.price > 50000000 ? 3 : 8),
      unit_price: round(it.price * (0.92 + rnd() * 0.16), 10000),
    });
  }
  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  await call("POST", "/purchase-invoices", {
    supplier_name: pick(suppliers),
    invoice_date: daysAgo(d),
    paid_amount: rnd() < 0.7 ? total : round(total * 0.5),
    note: rnd() < 0.3 ? "تسویه مابقی تا پایان ماه" : null,
    items: lines,
  });
}

async function stockMap() {
  const r = await call("GET", "/items?limit=1000");
  const rows = r.data ?? r.items ?? r;
  return new Map(rows.map((x) => [x.id, x.currentStock ?? x.current_stock ?? 0]));
}

// ── Customers ────────────────────────────────────────────────────────────
const firstNames = [
  "مهدی", "زهرا", "حسین", "فاطمه", "محمدرضا", "مریم", "علیرضا", "نرگس",
  "سعید", "الهام", "پویا", "شیما", "کامران", "لیلا", "بهزاد", "هانیه",
  "فرهاد", "سمیرا", "مجید", "آزاده", "یاسر", "مینا", "حمید", "پریسا",
];
const lastNames = [
  "موسوی", "جعفری", "صادقی", "نوری", "قاسمی", "اکبری", "رحیمی", "طاهری",
  "کاظمی", "شریفی", "باقری", "حیدری", "یوسفی", "عباسی", "مرادی", "زارعی",
];
const customers = [];
const usedNames = new Set();
while (customers.length < 42) {
  const name = `${pick(firstNames)} ${pick(lastNames)}`;
  if (usedNames.has(name)) continue;
  usedNames.add(name);
  const phone = `09${pick(["12", "13", "19", "35", "36", "37", "01", "02"])}${String(int(1000000, 9999999))}`;
  const c = await call("POST", "/customers", { name, phone });
  customers.push({ id: c.id ?? c.customer?.id, name, phone });
}

// ── Devices ──────────────────────────────────────────────────────────────
const deviceKinds = [
  ["گوشی موبایل", "Samsung", ["Galaxy A54", "Galaxy S23", "Galaxy A32", "Galaxy S21 FE"], ["صفحه شکسته، تاچ کار نمی‌کند", "شارژ نمی‌گیرد", "خاموش شده و روشن نمی‌شود", "باتری زود خالی می‌شود"]],
  ["گوشی موبایل", "Apple", ["iPhone 13", "iPhone 12", "iPhone 11", "iPhone 14 Pro"], ["فیس آیدی کار نمی‌کند", "صفحه شکسته", "آب‌خوردگی", "دوربین پشت تار است"]],
  ["گوشی موبایل", "Xiaomi", ["Redmi Note 12", "Poco X5", "Redmi 10"], ["ریستارت مداوم", "صدای مکالمه ضعیف", "صفحه خط افتاده"]],
  ["لپ‌تاپ", "Asus", ["VivoBook X515", "TUF F15", "ZenBook 14"], ["کیبورد چند کلیدش کار نمی‌کند", "داغ می‌کند و خاموش می‌شود", "ویندوز بالا نمی‌آید"]],
  ["لپ‌تاپ", "HP", ["Pavilion 15", "ProBook 450 G8", "Victus 16"], ["صدای فن زیاد است", "شارژر را نمی‌شناسد", "تصویر ندارد"]],
  ["لپ‌تاپ", "Lenovo", ["IdeaPad 3", "ThinkPad E14", "Legion 5"], ["کند است، ارتقا رم و SSD", "لولا شکسته", "روشن نمی‌شود"]],
  ["ماشین لباسشویی", "LG", ["WM-8K", "F4V5"], ["آب تخلیه نمی‌کند", "ارور OE می‌دهد", "روشن نمی‌شود"]],
  ["یخچال فریزر", "Samsung", ["RT38", "RS50"], ["سرد نمی‌کند", "برفک زیاد می‌زند"]],
  ["تبلت", "Samsung", ["Galaxy Tab A8", "Galaxy Tab S7"], ["صفحه شکسته", "شارژ نمی‌شود"]],
];

// age → plausible status
function statusFor(age) {
  if (age > 40) return pick(["delivered", "delivered", "delivered", "delivered", "not_repaired", "unrepairable"]);
  if (age > 14) return pick(["delivered", "delivered", "delivered", "ready_for_pickup", "repaired", "not_repaired"]);
  if (age > 5) return pick(["delivered", "ready_for_pickup", "repairing", "waiting_for_parts", "repaired", "diagnosing"]);
  return pick(["pending", "pending", "diagnosing", "repairing", "waiting_for_parts", "ready_for_pickup"]);
}

const devices = [];
const ages = [];
for (let i = 0; i < 64; i++) ages.push(int(0, 115) * (rnd() < 0.5 ? 0.35 : 1));
ages.sort((a, b) => b - a);
for (const ageF of ages) {
  const age = Math.floor(ageF);
  const [device_name, brand, models, issues] = pick(deviceKinds);
  const customer = pick(customers);
  const status = statusFor(age);
  const entry = daysAgo(age);
  const exitAge = Math.max(0, age - int(2, 9));
  const done = ["delivered", "not_repaired", "unrepairable"].includes(status);
  const d = await call("POST", "/devices", {
    customer_id: customer.id,
    device_name, brand,
    model: pick(models),
    serial_number: `${brand.slice(0, 2).toUpperCase()}${int(10000000, 99999999)}`,
    entry_date: entry,
    status: "pending",
    description: pick(issues),
    send_sms: false,
  });
  const id = d.id ?? d.device?.id;
  await call("PUT", `/devices/${id}`, {
    status,
    exit_date: done ? daysAgo(exitAge) : null,
    send_sms: false,
  });
  if (rnd() < 0.85) {
    const ids = [pick(techs)];
    if (rnd() < 0.15) ids.push(pick(techs));
    await call("PUT", `/devices/${id}/assignments`, { personnel_ids: [...new Set(ids)] });
  }
  devices.push({ id, age, status, device_name, customer, exitAge });
}

// ── Repair invoices ──────────────────────────────────────────────────────
const services = await call("GET", "/services");
const partsFor = (name) =>
  items.filter((it) =>
    name === "لپ‌تاپ" ? it.code.startsWith("LP")
    : name.includes("لباسشویی") || name.includes("یخچال") ? it.code.startsWith("HA")
    : it.code.startsWith("MB"));

for (const d of devices) {
  if (!["delivered", "ready_for_pickup", "repaired"].includes(d.status)) continue;
  if (rnd() < 0.1) continue;
  const lines = [
    { item_type: "service", name: services[0].name, quantity: 1, unit: "خدمت",
      unit_price: round(int(15, 60) * 100000) },
  ];
  if (rnd() < 0.5) lines.push({ item_type: "service", name: services[2].name, quantity: 1, unit: "خدمت", unit_price: 1500000 });
  if (rnd() < 0.75) {
    const stock = await stockMap();
    const avail = partsFor(d.device_name).filter((x) => (stock.get(x.id) ?? 0) > 0);
    const part = avail.length ? pick(avail) : null;
    if (part)
    lines.push({ item_type: "inventory", item_id: part.id, name: part.name, quantity: 1, unit: part.unit, unit_price: round(part.price * 1.35) });
    if (rnd() < 0.4 && (stock.get(items.find((i) => i.code === "CN-PST").id) ?? 0) > 0) lines.push({ item_type: "inventory", item_id: items.find((i) => i.code === "CN-PST").id, name: "خمیر سیلیکون حرارتی", quantity: 1, unit: "تیوب", unit_price: 1600000 });
  }
  const inv = await call("POST", "/repair-invoices", {
    device_id: d.id,
    customer_name: d.customer.name,
    customer_phone: d.customer.phone,
    invoice_date: daysAgo(d.exitAge),
    warranty_months: pick([1, 3, 3, 6]),
    technician_id: pick(techs),
    discount_type: rnd() < 0.2 ? "percentage" : null,
    discount_value: rnd() < 0.2 ? 10 : 0,
    items: lines,
  });
  const invId = inv.id ?? inv.invoice?.id;
  const total = inv.total_amount;
  if (d.status === "delivered") {
    await call("PUT", `/repair-invoices/${invId}/status`, { status: "issued" });
    const partial = rnd() < 0.12;
    await call("POST", `/repair-invoices/${invId}/payments`, {
      amount: partial ? round(total * 0.6) : total,
      payment_method: pick(["cash", "card", "card", "transfer"]),
    });
  } else if (rnd() < 0.7) {
    await call("PUT", `/repair-invoices/${invId}/status`, { status: "issued" });
  }
}

// ── Sale invoices ────────────────────────────────────────────────────────
for (let i = 0; i < 34; i++) {
  const age = Math.floor(int(0, 110) * (rnd() < 0.55 ? 0.3 : 1));
  const lines = [];
  const used = new Set();
  const stock = await stockMap();
  const avail = items.filter((x) => (x.code.startsWith("MB") || x.code.startsWith("LP")) && (stock.get(x.id) ?? 0) > 0);
  if (!avail.length) continue;
  for (let j = 0; j < int(1, 3); j++) {
    const it = pick(avail);
    if (used.has(it.id)) continue;
    used.add(it.id);
    lines.push({ item_type: "inventory", item_id: it.id, quantity: 1, unit_price: round(it.price * 1.3) });
  }
  if (rnd() < 0.3) lines.push({ item_type: "custom", name: "گلس محافظ صفحه", unit: "عدد", quantity: int(1, 2), unit_price: 1500000 });
  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const c = rnd() < 0.7 ? pick(customers) : null;
  await call("POST", "/sale-invoices", {
    customer_id: c?.id ?? null,
    customer_name: c ? c.name : "مشتری حضوری",
    invoice_date: daysAgo(age),
    paid_amount: rnd() < 0.8 ? total : rnd() < 0.5 ? round(total * 0.5) : 0,
    items: lines,
  });
}

// ── A few customer notes ────────────────────────────────────────────────
await call("PUT", `/customers/${customers[0].id}/notes`, {
  notes: "مشتری همیشگی — قبل از تعویض قطعه حتماً تماس گرفته شود. تخفیف ۱۰٪ دارد.",
});
await call("PUT", `/customers/${customers[1].id}/notes`, {
  notes: "دیر تسویه می‌کند؛ دستگاه را قبل از پرداخت کامل تحویل ندهید.",
});

console.log(JSON.stringify({ techs, items: items.length, customers: customers.length, devices: devices.length }));
