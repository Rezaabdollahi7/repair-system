/** Stub for src/api, resolved in place of it by the preview Vite plugin. */
const ok = <T,>(data: T) => Promise.resolve({ data });

const day = (n: number) => {
  const d = new Date("2026-09-09T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

const TREND = [
  4100000, 0, 2350000, 6800000, 5200000, 0, 3900000, 7400000, 2800000, 5900000,
  8200000, 4600000, 6100000, 9350000,
].map((repair, i) => ({
  date: day(13 - i),
  repair,
  sale: Math.round(repair * 0.42),
}));

const STATS = {
  items: { total: 148, low_stock: 7 },
  today: { purchase: 3200000, sale: 8450000, net: 5250000 },
  month: { purchase: 62400000, sale: 141800000, net: 79400000 },
  devices: {
    total: 96, today: 4, repairing: 31,
    by_status: [
      { status: "pending", count: 12 },
      { status: "diagnosing", count: 8 },
      { status: "unrepairable", count: 3 },
      { status: "waiting_for_parts", count: 9 },
      { status: "repairing", count: 31 },
      { status: "repaired", count: 5 },
      { status: "ready_for_pickup", count: 12 },
      { status: "delivered", count: 16 },
    ],
  },
  repair_invoices: {
    today_count: 6, today_revenue: 9350000, month_revenue: 118600000,
    pending_payment_count: 11, issued_unpaid_amount: 34200000,
    month_paid: 84400000, month_unpaid: 34200000,
  },
  revenue_series: TREND,
  technician_load: {
    open_devices: 60,
    unassigned: 9,
    technicians: [
      { id: 2, name: "علی رضایی", count: 24 },
      { id: 3, name: "سارا نوری", count: 17 },
      { id: 4, name: "حسین مرادی", count: 10 },
    ],
  },
  top_items: [
    { name: "باتری اورجینال گلکسی A54", code: "BT-A54", revenue: 42600000, sold_quantity: 24 },
    { name: "شارژر فست ۲۵ وات", code: "CH-25W", revenue: 21400000, sold_quantity: 61 },
    { name: "گلس محافظ فول‌چسب", code: "GL-FULL", revenue: 12900000, sold_quantity: 143 },
    { name: "برد شارژ آیفون ۱۲", code: "BD-IP12", revenue: 9800000, sold_quantity: 7 },
    { name: "کابل تایپ‌سی ۱ متری", code: "CB-C1M", revenue: 4300000, sold_quantity: 88 },
  ],
  recent_transactions: [
    { id: 1, item_id: 7, item_name: "باتری اورجینال گلکسی A54", item_code: "BT-A54", type: "purchase", quantity: 24, unit_price: 3600000, created_at: "2026-09-08T09:12:00.000Z" },
    { id: 2, item_id: 9, item_name: "شارژر فست ۲۵ وات", item_code: "CH-25W", type: "sale", quantity: -3, unit_price: 700000, created_at: "2026-09-08T11:40:00.000Z" },
    { id: 3, item_id: 11, item_name: "گلس محافظ فول‌چسب", item_code: "GL-FULL", type: "sale", quantity: -12, unit_price: 90000, created_at: "2026-09-07T16:05:00.000Z" },
    { id: 4, item_id: 14, item_name: "کابل تایپ‌سی ۱ متری", item_code: "CB-C1M", type: "adjustment", quantity: 2, unit_price: null, created_at: "2026-09-07T08:20:00.000Z" },
    { id: 5, item_id: 7, item_name: "باتری اورجینال گلکسی A54", item_code: "BT-A54", type: "sale", quantity: -1, unit_price: 4200000, created_at: "2026-09-06T13:55:00.000Z" },
    { id: 6, item_id: 21, item_name: "برد شارژ آیفون ۱۲", item_code: "BD-IP12", type: "purchase", quantity: 5, unit_price: 1400000, created_at: "2026-09-05T10:30:00.000Z" },
  ],
};

const DEVICES = [
  { id: 3, customer_id: 5, device_name: "گوشی موبایل", brand: "سامسونگ", model: "Galaxy A54", serial_number: "SM-A546B-9931", entry_date: "2026-09-02T00:00:00.000Z", exit_date: null, status: "repairing", description: "شارژ نمی‌شود", created_at: "2026-09-02T00:00:00.000Z", updated_at: "2026-09-02T00:00:00.000Z", needs_invoice: true, customer_name: "زهرا کریمی", customer_phone: "09121234567", invoice_status: null, sale_invoice_id: null, invoice_count: 0, assignees: [{ id: 2, name: "علی رضایی" }] },
  { id: 4, customer_id: 6, device_name: "لپ‌تاپ", brand: "ایسوس", model: "VivoBook 15", serial_number: "AS-VB15-2210", entry_date: "2026-08-30T00:00:00.000Z", exit_date: null, status: "waiting_for_parts", description: "صفحه‌کلید کار نمی‌کند", created_at: "2026-08-30T00:00:00.000Z", updated_at: "2026-08-30T00:00:00.000Z", needs_invoice: false, customer_name: "مهدی احمدی", customer_phone: "09351112233", invoice_status: null, sale_invoice_id: null, invoice_count: 0, assignees: [] },
  { id: 5, customer_id: 5, device_name: "ماشین لباسشویی", brand: "اسنوا", model: "SWM-84508", serial_number: null, entry_date: "2026-08-24T00:00:00.000Z", exit_date: "2026-09-01T00:00:00.000Z", status: "delivered", description: null, created_at: "2026-08-24T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z", needs_invoice: true, customer_name: "زهرا کریمی", customer_phone: "09121234567", invoice_status: "paid", sale_invoice_id: 12, invoice_count: 1, assignees: [{ id: 2, name: "علی رضایی" }] },
];

const ITEMS = [
  { id: 7, sku: "BT-A54", name: "باتری اورجینال گلکسی A54", categoryId: 1, categoryName: "باتری", unit: "عدد", minStock: 3, currentStock: 6, purchasePrice: 3600000, salePrice: 4200000, isActive: true },
  { id: 9, sku: "CH-25W", name: "شارژر فست ۲۵ وات", categoryId: 2, categoryName: "شارژر", unit: "عدد", minStock: 5, currentStock: 2, purchasePrice: 500000, salePrice: 700000, isActive: true },
  { id: 11, sku: "GL-FULL", name: "گلس محافظ فول‌چسب", categoryId: 3, categoryName: "لوازم جانبی", unit: "عدد", minStock: 20, currentStock: 0, purchasePrice: 45000, salePrice: 90000, isActive: true },
];

const CUSTOMERS = [
  { id: 5, name: "زهرا کریمی", phone: "09121234567", address: "تهران، خیابان ولیعصر، پلاک ۱۲", device_count: 3 },
  { id: 6, name: "مهدی احمدی", phone: "09351112233", address: null, device_count: 1 },
];

const REPAIR_INVOICES = [
  { id: 1, invoice_number: "REP-0042", device_id: 3, customer_id: 5, customer_name: "زهرا کریمی", customer_phone: "09121234567", invoice_date: "2026-08-30T00:00:00.000Z", due_date: null, status: "issued", subtotal: 5230000, discount_type: null, discount_value: 0, discount_amount: 0, tax_rate: 9, tax_amount: 470700, total_amount: 5700700, paid_amount: 2000000, payment_status: "partial", warranty_months: 3, warranty_until: null, technician_id: 2, notes: null, created_by: 1, created_at: "2026-08-30T00:00:00.000Z", updated_at: "2026-08-30T00:00:00.000Z", device_name: "گوشی موبایل", brand: "سامسونگ", model: "Galaxy A54", serial_number: "SM-A546B-9931", technician_name: "علی رضایی" },
  { id: 2, invoice_number: "REP-0041", device_id: 5, customer_id: 5, customer_name: "زهرا کریمی", customer_phone: "09121234567", invoice_date: "2026-08-27T00:00:00.000Z", due_date: null, status: "cancelled", subtotal: 1800000, discount_type: null, discount_value: 0, discount_amount: 0, tax_rate: 0, tax_amount: 0, total_amount: 1800000, paid_amount: 500000, payment_status: "cancelled", warranty_months: 0, warranty_until: null, technician_id: 2, notes: null, created_by: 1, created_at: "2026-08-27T00:00:00.000Z", updated_at: "2026-08-28T00:00:00.000Z", device_name: "ماشین لباسشویی", brand: "اسنوا", model: "SWM-84508", serial_number: null, technician_name: "علی رضایی" },
  { id: 3, invoice_number: "REP-0040", device_id: 4, customer_id: 6, customer_name: "مهدی احمدی", customer_phone: "09351112233", invoice_date: "2026-08-21T00:00:00.000Z", due_date: null, status: "paid", subtotal: 3400000, discount_type: null, discount_value: 0, discount_amount: 0, tax_rate: 9, tax_amount: 306000, total_amount: 3706000, paid_amount: 3706000, payment_status: "paid", warranty_months: 6, warranty_until: null, technician_id: 2, notes: null, created_by: 1, created_at: "2026-08-21T00:00:00.000Z", updated_at: "2026-08-21T00:00:00.000Z", device_name: "لپ‌تاپ", brand: "ایسوس", model: "VivoBook 15", serial_number: "AS-VB15-2210", technician_name: "علی رضایی" },
];

const PAYMENTS = [
  { id: 1, order_id: "DFX-1001", plan_name: "شش‌ماهه", status: "verified", base_price_rials: 25000000, discount_rials: 2100000, amount_rials: 22900000, ref_number: "883912", card_number: "6104-****-****-2213", paid_at: "2026-04-02T09:00:00.000Z", created_at: "2026-04-02T08:58:00.000Z", created_by_name: "رضا عبداللهی" },
  { id: 2, order_id: "DFX-1002", plan_name: "یک‌ماهه", status: "failed", base_price_rials: 4900000, discount_rials: 0, amount_rials: 4900000, ref_number: null, card_number: null, paid_at: null, created_at: "2026-03-01T12:20:00.000Z", created_by_name: "رضا عبداللهی" },
  { id: 3, order_id: "DFX-1003", plan_name: "یک‌ماهه", status: "verified", base_price_rials: 4900000, discount_rials: 490000, amount_rials: 4410000, ref_number: "770118", card_number: "6104-****-****-2213", paid_at: "2026-02-01T10:05:00.000Z", created_at: "2026-02-01T10:02:00.000Z", created_by_name: "رضا عبداللهی" },
];


const PERSONNEL_OVERVIEW = {
  personnel: {
    id: 2, workspace_id: 1, full_name: "علی رضایی", username: "09120000002",
    phone: "09120000002", avatar: null, role_id: 3, is_active: true,
    created_at: "2025-02-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z",
    role_name: "technician", role_label: "تعمیرکار",
  },
  kpi: { active_devices: 5, completed_repairs: 34, successful_repairs: 31, avg_repair_days: 4.3 },
  status_breakdown: [
    { status: "repairing", count: 3 },
    { status: "waiting_for_parts", count: 2 },
    { status: "delivered", count: 26 },
    { status: "repaired", count: 5 },
    { status: "unrepairable", count: 3 },
  ],
  history: [
    { device_id: 3, device_name: "گوشی موبایل", brand: "سامسونگ", model: "Galaxy A54", status: "repairing", entry_date: "2026-09-02T00:00:00.000Z", exit_date: null, repair_days: null, assigned_at: "2026-09-02T00:00:00.000Z" },
    { device_id: 5, device_name: "ماشین لباسشویی", brand: "اسنوا", model: "SWM-84508", status: "delivered", entry_date: "2026-08-24T00:00:00.000Z", exit_date: "2026-09-01T00:00:00.000Z", repair_days: 8, assigned_at: "2026-08-24T00:00:00.000Z" },
    { device_id: 8, device_name: "لپ‌تاپ", brand: "لنوو", model: "IdeaPad 3", status: "unrepairable", entry_date: "2026-07-11T00:00:00.000Z", exit_date: "2026-07-19T00:00:00.000Z", repair_days: 8, assigned_at: "2026-07-11T00:00:00.000Z" },
    { device_id: 11, device_name: "ماکروویو", brand: "ال‌جی", model: "MS2044", status: "delivered", entry_date: "2026-06-02T00:00:00.000Z", exit_date: "2026-06-05T00:00:00.000Z", repair_days: 3, assigned_at: "2026-06-02T00:00:00.000Z" },
  ],
  monthly: [
    { jy: 1404, jm: 7, label: "مهر ۱۴۰۴", count: 2 },
    { jy: 1404, jm: 8, label: "آبان ۱۴۰۴", count: 4 },
    { jy: 1404, jm: 9, label: "آذر ۱۴۰۴", count: 3 },
    { jy: 1404, jm: 10, label: "دی ۱۴۰۴", count: 0 },
    { jy: 1404, jm: 11, label: "بهمن ۱۴۰۴", count: 5 },
    { jy: 1404, jm: 12, label: "اسفند ۱۴۰۴", count: 6 },
    { jy: 1405, jm: 1, label: "فروردین ۱۴۰۵", count: 1 },
    { jy: 1405, jm: 2, label: "اردیبهشت ۱۴۰۵", count: 4 },
    { jy: 1405, jm: 3, label: "خرداد ۱۴۰۵", count: 7 },
    { jy: 1405, jm: 4, label: "تیر ۱۴۰۵", count: 5 },
    { jy: 1405, jm: 5, label: "مرداد ۱۴۰۵", count: 8 },
    { jy: 1405, jm: 6, label: "شهریور ۱۴۰۵", count: 3 },
  ],
};

const paged = <T,>(rows: T[]) =>
  ok({ data: rows, total: rows.length, page: 1, limit: 20, totalPages: 1 });

export const getDashboardStats = () => ok(STATS);
export const getDevices = () => paged(DEVICES);
export const getDevice = () => ok(DEVICES[0]);
export const getItems = () => paged(ITEMS);
export const getItem = () => ok(ITEMS[0]);
export const getCustomers = () => paged(CUSTOMERS);
export const getCustomer = () => ok(CUSTOMERS[0]);
export const searchCustomers = () => ok(CUSTOMERS);
export const getRepairInvoices = () => paged(REPAIR_INVOICES);
export const getRepairInvoice = () => ok({ ...REPAIR_INVOICES[0], items: [], payments: [] });
export const getPaymentHistory = () => ok(PAYMENTS);
export const getCategories = () => ok([{ id: 1, name: "باتری" }, { id: 2, name: "شارژر" }, { id: 3, name: "لوازم جانبی" }]);
export const getTechnicians = () => ok([{ id: 2, full_name: "علی رضایی", username: "09120000002", role: "technician" }]);
export const getPersonnel = () =>
  ok([
    { id: 1, full_name: "رضا عبداللهی", username: "09120000001", role_name: "super_admin", role_label: "مدیر ارشد", phone: "09120000001", is_active: true, created_at: "2026-01-01T00:00:00.000Z" },
    { id: 2, full_name: "علی رضایی", username: "09120000002", role_name: "technician", role_label: "تعمیرکار", phone: "09120000002", is_active: true, created_at: "2026-02-01T00:00:00.000Z" },
    { id: 3, full_name: "سارا نوری", username: "09120000003", role_name: "admin", role_label: "مدیر", phone: "09120000003", is_active: false, created_at: "2026-03-01T00:00:00.000Z" },
  ]);
export const getSettings = () =>
  ok({ default_tax_rate: 9, default_warranty_months: 3, shop_name: "تعمیرگاه دُفیکسو", shop_phone: "02155667788", shop_address: "تهران", logo_path: null, stamp_path: null, invoice_header: null, invoice_footer: null, tax_rate: 9, theme: "light" });
export const getStockReport = () =>
  ok({ items: ITEMS.map((i) => ({ id: i.id, code: i.sku, name: i.name, category_name: i.categoryName, unit: i.unit, min_stock: i.minStock, current_stock: i.currentStock, stock_value: i.currentStock * i.purchasePrice })), summary: { total_inventory_value: 24600000, total_items: 3, low_stock_count: 1, critical_count: 1 } });
export const getProfitReport = () =>
  ok({ data: [], summary: { total_profit: 79400000, total_revenue: 141800000, total_cost: 62400000, profit_margin: 56 } });
export const getQuote = () => ok({ base_price_rials: 25000000, discount_rials: 2100000, amount_rials: 22900000, discount_kind: "referral", code_accepted: null });
export const getReferral = () => ok({ code: "DFX-8241", reward_days: 15, discount_percent: 10, invited_count: 3, subscribed_count: 1, earned_days: 15 });

const noop = () => ok({ success: true });
const empty = () => ok([]);
export const getItemTransactions = empty;
export const getServices = empty;
export const getCustomerDevices = empty;
export const getDeviceImages = empty;
export const getDeviceAssignments = empty;
export const getExports = empty;
export const getSaleInvoices = () => paged([]);
export const getPurchaseInvoices = () => paged([]);
export const getSaleInvoice = noop;
export const getPurchaseInvoice = noop;
export const searchItems = () => ok(ITEMS);
export const searchItemsForInvoice = () => ok([]);
export const searchDevicesForInvoice = () => paged([]);
export const getPersonnelOne = noop;
export const getPersonnelOverview = () => ok(PERSONNEL_OVERVIEW);
export const getCustomerStats = noop;
export const getExportDownload = noop;
export const getDeviceImageUrl = () => "";
export const createDevice = noop;
export const updateDevice = noop;
export const deleteDevice = noop;
export const setDeviceAssignments = noop;
export const createCustomer = noop;
export const updateCustomer = noop;
export const deleteCustomer = noop;
export const createItem = noop;
export const updateItem = noop;
export const deleteItem = noop;
export const createCategory = noop;
export const updateCategory = noop;
export const deleteCategory = noop;
export const createPersonnel = noop;
export const updatePersonnel = noop;
export const deletePersonnel = noop;
export const togglePersonnelActive = noop;
export const createRepairInvoice = noop;
export const updateRepairInvoice = noop;
export const deleteRepairInvoice = noop;
export const changeRepairInvoiceStatus = noop;
export const addRepairInvoicePayment = noop;
export const createSaleInvoice = noop;
export const updateSaleInvoice = noop;
export const deleteSaleInvoice = noop;
export const updateSaleInvoicePayment = noop;
export const createPurchaseInvoice = noop;
export const deletePurchaseInvoice = noop;
export const updatePurchaseInvoicePayment = noop;
export const createExport = noop;
export const deleteExport = noop;
export const updateSettings = noop;
export const uploadSettingImage = noop;
export const startCheckout = noop;
export const verifyPayment = noop;
export const login = noop;
export const register = noop;
export const resetPassword = noop;
export const sendOtp = noop;
export const quickSale = noop;
export const quickPurchase = noop;
export default {};
