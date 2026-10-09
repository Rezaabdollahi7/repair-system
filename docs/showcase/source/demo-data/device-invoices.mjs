const API = "http://localhost:5001/api";
let seed = 77; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
let token;
async function call(method, path, body) {
  const res = await fetch(API + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${t}`); return t ? JSON.parse(t) : null;
}
token = (await call("POST", "/auth/login", { username: "09121234567", password: "Demo@12345" })).token;
const devs = (await call("GET", "/devices?limit=1000")).data;
const itemsAll = (await call("GET", "/items?limit=1000")).data;
for (const d of devs) {
  if (["not_repaired", "unrepairable"].includes(d.status)) { await call("PUT", `/devices/${d.id}`, { needs_invoice: false, send_sms: false }); continue; }
  const billable = d.status === "delivered" || (d.status === "ready_for_pickup" && rnd() < 0.6) || (d.status === "repaired" && rnd() < 0.3);
  if (!billable) continue;
  const prefix = d.device_name === "لپ‌تاپ" ? "LP" : /لباسشویی|یخچال/.test(d.device_name) ? "HA" : "MB";
  const stock = (await call("GET", "/items?limit=1000")).data;
  const avail = stock.filter((i) => i.code.startsWith(prefix) && (i.currentStock ?? i.current_stock) > 0);
  const lines = [{ item_type: "custom", name: "دستمزد تعمیر", unit: "خدمت", quantity: 1, unit_price: int(15, 60) * 100000 }];
  if (avail.length && rnd() < 0.7) { const p = pick(avail); lines.push({ item_type: "inventory", item_id: p.id, quantity: 1, unit_price: Number(p.sell_price ?? p.sellPrice) }); }
  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const date = d.exit_date ?? new Date(new Date(d.entry_date).getTime() + int(2, 6) * 864e5).toISOString();
  const paid = d.status === "delivered" ? (rnd() < 0.88 ? total : Math.round(total * 0.5 / 100000) * 100000) : (rnd() < 0.3 ? Math.round(total * 0.3 / 100000) * 100000 : 0);
  await call("POST", "/sale-invoices", { device_id: d.id, customer_id: d.customer_id, invoice_date: new Date(Math.min(Date.parse(date), Date.now() - 36e5)).toISOString(), paid_amount: paid, note: `بابت تعمیر ${d.device_name} ${d.brand ?? ""} ${d.model ?? ""}`.trim(), items: lines });
}
console.log("ok", devs.length, itemsAll.length);
