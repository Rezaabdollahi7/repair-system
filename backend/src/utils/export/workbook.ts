import ExcelJS from "exceljs";
import jalaali from "jalaali-js";
import prisma from "../../lib/prisma";

/**
 * Dates are written in Jalali, not ISO: the reader is a workshop owner, and
 * "2026-01-15T10:30:00.000Z" is not a date to them.
 *
 * Converted through the local timezone rather than the raw UTC parts, so a
 * record saved at 02:00 Tehran shows the day it actually happened rather
 * than the one before.
 */
function toJalali(date: Date | null): string {
  if (!date) return "";
  const { jy, jm, jd } = jalaali.toJalaali(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  );
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}

const DEVICE_STATUS: Record<string, string> = {
  received: "دریافت شده",
  pending: "در انتظار بررسی",
  diagnosing: "در حال بررسی",
  waiting_for_parts: "در انتظار قطعه",
  repairing: "در حال تعمیر",
  repaired: "تعمیر شده",
  ready_for_pickup: "آماده تحویل",
  delivered: "تحویل داده شده",
  unrepairable: "غیرقابل تعمیر",
  not_repaired: "تعمیر نشد",
};

const PAYMENT_STATUS: Record<string, string> = {
  paid: "پرداخت شده",
  partial: "پرداخت ناقص",
  pending: "در انتظار پرداخت",
};

const REPAIR_STATUS: Record<string, string> = {
  draft: "پیش‌نویس",
  issued: "صادر شده",
  paid: "پرداخت شده",
  cancelled: "ابطال شده",
};

/** Thousands separators, no decimals — amounts are Decimal(18, 0). */
const MONEY = "#,##0";

interface Column {
  header: string;
  key: string;
  width: number;
  numFmt?: string;
}

/**
 * One sheet per resource. Right-to-left, header row frozen and bold, so the
 * file opens usable rather than as a wall of cells.
 */
function addSheet(
  book: ExcelJS.Workbook,
  name: string,
  columns: Column[],
  rows: Record<string, unknown>[],
): void {
  const sheet = book.addWorksheet(name, {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });

  sheet.columns = columns.map(({ header, key, width }) => ({
    header,
    key,
    width,
  }));

  for (const column of columns) {
    if (column.numFmt) {
      sheet.getColumn(column.key).numFmt = column.numFmt;
    }
  }

  sheet.getRow(1).font = { bold: true };
  sheet.addRows(rows);
}

/**
 * Builds the workbook for one workspace.
 *
 * Every query here is scoped by the Prisma client extension, which reads the
 * workspace from the async context the caller opened — there is no
 * workspaceId argument to get wrong.
 *
 * Amounts are written as numbers, not formatted strings: a shop owner who
 * wants a total should be able to select a column and get one, which a
 * string of Persian digits would not allow.
 */
export async function buildWorkbook(): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "Dofixo";
  book.created = new Date();

  // Sequential, not Promise.all: each query opens its own transaction through
  // the client extension, and six heavy ones at once take most of a
  // ten-connection pool — enough that an ordinary request alongside the build
  // fails to get one. Nobody is waiting on this build, so the extra seconds
  // cost nothing.
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { devices: true } } },
  });

  const devices = await prisma.device.findMany({
    orderBy: { id: "desc" },
    include: { customer: { select: { name: true, phone: true } } },
  });

  const items = await prisma.item.findMany({
    orderBy: { code: "asc" },
    include: { category: { select: { name: true } } },
  });

  const saleInvoices = await prisma.saleInvoice.findMany({
    orderBy: { invoiceDate: "desc" },
    include: {
      items: { include: { item: { select: { code: true, name: true } } } },
    },
  });

  const purchaseInvoices = await prisma.purchaseInvoice.findMany({
    orderBy: { invoiceDate: "desc" },
    include: {
      items: { include: { item: { select: { code: true, name: true } } } },
    },
  });

  const repairInvoices = await prisma.repairInvoice.findMany({
    orderBy: { invoiceDate: "desc" },
    include: {
      device: { select: { deviceName: true, brand: true } },
      items: true,
    },
  });

  addSheet(
    book,
    "مشتریان",
    [
      { header: "نام", key: "name", width: 28 },
      { header: "شماره تماس", key: "phone", width: 16 },
      { header: "تعداد دستگاه", key: "devices", width: 14 },
      { header: "تاریخ عضویت", key: "createdAt", width: 14 },
    ],
    customers.map((customer) => ({
      name: customer.name,
      phone: customer.phone ?? "",
      devices: customer._count.devices,
      createdAt: toJalali(customer.createdAt),
    })),
  );

  addSheet(
    book,
    "دستگاه‌ها",
    [
      { header: "شماره پذیرش", key: "id", width: 14 },
      { header: "مشتری", key: "customer", width: 24 },
      { header: "شماره تماس", key: "phone", width: 16 },
      { header: "نوع دستگاه", key: "deviceName", width: 20 },
      { header: "برند", key: "brand", width: 14 },
      { header: "مدل", key: "model", width: 16 },
      { header: "سریال", key: "serial", width: 20 },
      { header: "وضعیت", key: "status", width: 16 },
      { header: "تاریخ ورود", key: "entryDate", width: 14 },
      { header: "تاریخ خروج", key: "exitDate", width: 14 },
      { header: "توضیحات", key: "description", width: 40 },
    ],
    devices.map((device) => ({
      id: device.id,
      customer: device.customer?.name ?? "",
      phone: device.customer?.phone ?? "",
      deviceName: device.deviceName,
      brand: device.brand ?? "",
      model: device.model ?? "",
      serial: device.serialNumber ?? "",
      status: DEVICE_STATUS[device.status] ?? device.status,
      entryDate: toJalali(device.entryDate),
      exitDate: toJalali(device.exitDate),
      description: device.description ?? "",
    })),
  );

  addSheet(
    book,
    "کالاها",
    [
      { header: "کد کالا", key: "code", width: 18 },
      { header: "نام کالا", key: "name", width: 34 },
      { header: "دسته‌بندی", key: "category", width: 18 },
      { header: "واحد", key: "unit", width: 10 },
      { header: "موجودی", key: "stock", width: 10 },
      { header: "حداقل موجودی", key: "minStock", width: 14 },
      {
        header: "میانگین قیمت خرید",
        key: "avgPrice",
        width: 18,
        numFmt: MONEY,
      },
      { header: "قیمت فروش", key: "sellPrice", width: 16, numFmt: MONEY },
    ],
    items.map((item) => ({
      code: item.code,
      name: item.name,
      category: item.category?.name ?? "",
      unit: item.unit,
      stock: item.currentStock,
      minStock: item.minStock,
      avgPrice: item.avgPurchasePrice.toNumber(),
      sellPrice: item.sellPrice.toNumber(),
    })),
  );

  addSheet(
    book,
    "فاکتور فروش",
    [
      { header: "شماره فاکتور", key: "number", width: 16 },
      { header: "مشتری", key: "customer", width: 24 },
      { header: "شماره تماس", key: "phone", width: 16 },
      { header: "تاریخ", key: "date", width: 14 },
      { header: "مبلغ کل", key: "total", width: 16, numFmt: MONEY },
      { header: "پرداخت شده", key: "paid", width: 16, numFmt: MONEY },
      { header: "مانده", key: "remaining", width: 16, numFmt: MONEY },
      { header: "وضعیت پرداخت", key: "status", width: 16 },
      { header: "توضیحات", key: "note", width: 34 },
    ],
    saleInvoices.map((invoice) => ({
      number: invoice.invoiceNumber,
      customer: invoice.customerName,
      phone: invoice.customerPhone ?? "",
      date: toJalali(invoice.invoiceDate),
      total: invoice.totalAmount.toNumber(),
      paid: invoice.paidAmount.toNumber(),
      remaining: invoice.totalAmount.toNumber() - invoice.paidAmount.toNumber(),
      status: PAYMENT_STATUS[invoice.paymentStatus] ?? invoice.paymentStatus,
      note: invoice.note ?? "",
    })),
  );

  addSheet(
    book,
    "فاکتور خرید",
    [
      { header: "شماره فاکتور", key: "number", width: 16 },
      { header: "فروشنده", key: "supplier", width: 28 },
      { header: "تاریخ", key: "date", width: 14 },
      { header: "مبلغ کل", key: "total", width: 16, numFmt: MONEY },
      { header: "پرداخت شده", key: "paid", width: 16, numFmt: MONEY },
      { header: "مانده", key: "remaining", width: 16, numFmt: MONEY },
      { header: "وضعیت پرداخت", key: "status", width: 16 },
      { header: "توضیحات", key: "note", width: 34 },
    ],
    purchaseInvoices.map((invoice) => ({
      number: invoice.invoiceNumber,
      supplier: invoice.supplierName ?? "",
      date: toJalali(invoice.invoiceDate),
      total: invoice.totalAmount.toNumber(),
      paid: invoice.paidAmount.toNumber(),
      remaining: invoice.totalAmount.toNumber() - invoice.paidAmount.toNumber(),
      status: PAYMENT_STATUS[invoice.paymentStatus] ?? invoice.paymentStatus,
      note: invoice.note ?? "",
    })),
  );

  addSheet(
    book,
    "فاکتور تعمیر",
    [
      { header: "شماره فاکتور", key: "number", width: 16 },
      { header: "شماره پذیرش", key: "deviceId", width: 14 },
      { header: "دستگاه", key: "device", width: 24 },
      { header: "مشتری", key: "customer", width: 24 },
      { header: "تاریخ", key: "date", width: 14 },
      { header: "جمع اقلام", key: "subtotal", width: 16, numFmt: MONEY },
      { header: "تخفیف", key: "discount", width: 14, numFmt: MONEY },
      { header: "مالیات", key: "tax", width: 14, numFmt: MONEY },
      { header: "مبلغ نهایی", key: "total", width: 16, numFmt: MONEY },
      { header: "پرداخت شده", key: "paid", width: 16, numFmt: MONEY },
      { header: "وضعیت", key: "status", width: 14 },
      { header: "گارانتی (ماه)", key: "warranty", width: 14 },
      { header: "توضیحات", key: "notes", width: 34 },
    ],
    repairInvoices.map((invoice) => ({
      number: invoice.invoiceNumber,
      deviceId: invoice.deviceId,
      device: invoice.device.deviceName,
      customer: invoice.customerName,
      date: toJalali(invoice.invoiceDate),
      subtotal: invoice.subtotal.toNumber(),
      discount: invoice.discountAmount.toNumber(),
      tax: invoice.taxAmount.toNumber(),
      total: invoice.totalAmount.toNumber(),
      paid: invoice.paidAmount.toNumber(),
      status: REPAIR_STATUS[invoice.status] ?? invoice.status,
      warranty: invoice.warrantyMonths,
      notes: invoice.notes ?? "",
    })),
  );

  // One sheet for every line of every invoice kind rather than three. The
  // columns are nearly the same, and a single sheet with a "kind" column can
  // be filtered — three cannot be compared.
  const lines: Record<string, unknown>[] = [];

  for (const invoice of purchaseInvoices) {
    for (const line of invoice.items) {
      lines.push({
        kind: "خرید",
        number: invoice.invoiceNumber,
        date: toJalali(invoice.invoiceDate),
        code: line.item.code,
        name: line.item.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice.toNumber(),
        total: line.totalPrice.toNumber(),
      });
    }
  }

  for (const invoice of saleInvoices) {
    for (const line of invoice.items) {
      lines.push({
        kind: "فروش",
        number: invoice.invoiceNumber,
        date: toJalali(invoice.invoiceDate),
        // A custom line points at no catalogue item, so it carries the name
        // it was written with and no code.
        code: line.item?.code ?? "",
        name: line.item?.name ?? line.name ?? "",
        quantity: line.quantity,
        unitPrice: line.unitPrice.toNumber(),
        total: line.totalPrice.toNumber(),
      });
    }
  }

  for (const invoice of repairInvoices) {
    for (const line of invoice.items) {
      lines.push({
        kind: "تعمیر",
        number: invoice.invoiceNumber,
        date: toJalali(invoice.invoiceDate),
        code: "",
        name: line.name,
        quantity: line.quantity.toNumber(),
        unitPrice: line.unitPrice.toNumber(),
        total: line.totalPrice.toNumber(),
      });
    }
  }

  addSheet(
    book,
    "اقلام فاکتورها",
    [
      { header: "نوع فاکتور", key: "kind", width: 12 },
      { header: "شماره فاکتور", key: "number", width: 16 },
      { header: "تاریخ", key: "date", width: 14 },
      { header: "کد کالا", key: "code", width: 18 },
      { header: "شرح", key: "name", width: 34 },
      { header: "تعداد", key: "quantity", width: 10 },
      { header: "قیمت واحد", key: "unitPrice", width: 16, numFmt: MONEY },
      { header: "جمع", key: "total", width: 16, numFmt: MONEY },
    ],
    lines,
  );

  const buffer = await book.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
