import ExcelJS from "exceljs";
import jalaali from "jalaali-js";
import prisma from "../../lib/prisma";
import { REASON_LABELS } from "../../schemas/stockAdjustment";

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

const COUNT_STATUS: Record<string, string> = {
  draft: "در حال شمارش",
  applied: "اعمال‌شده",
  cancelled: "لغو‌شده",
};

const REPAIR_STATUS: Record<string, string> = {
  draft: "پیش‌فاکتور",
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
      warehouse: { select: { name: true } },
      items: { include: { item: { select: { code: true, name: true } } } },
    },
  });

  const purchaseInvoices = await prisma.purchaseInvoice.findMany({
    orderBy: { invoiceDate: "desc" },
    include: {
      warehouse: { select: { name: true } },
      items: { include: { item: { select: { code: true, name: true } } } },
    },
  });

  const repairInvoices = await prisma.repairInvoice.findMany({
    orderBy: { invoiceDate: "desc" },
    include: {
      warehouse: { select: { name: true } },
      device: {
        select: { receptionNumber: true, deviceName: true, brand: true },
      },
      items: true,
    },
  });

  // What each warehouse holds (14.10). Rows at zero are left out: an item
  // that once passed through a warehouse keeps a row there, and a sheet of
  // zeros answers nothing.
  const stocks = await prisma.itemStock.findMany({
    where: { quantity: { gt: 0 } },
    orderBy: [{ warehouseId: "asc" }, { itemId: "asc" }],
    include: {
      warehouse: { select: { name: true, isActive: true } },
      item: {
        select: { code: true, name: true, unit: true, avgPurchasePrice: true },
      },
    },
  });

  const adjustments = await prisma.stockAdjustment.findMany({
    orderBy: [{ adjustedAt: "desc" }, { id: "desc" }],
    include: {
      warehouse: { select: { name: true } },
      lines: {
        orderBy: { id: "asc" },
        include: { item: { select: { code: true, name: true, unit: true } } },
      },
    },
  });

  const stockCounts = await prisma.stockCount.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      warehouse: { select: { name: true } },
      lines: {
        where: { countedQuantity: { not: null } },
        orderBy: { id: "asc" },
        include: { item: { select: { code: true, name: true, unit: true } } },
      },
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
      { header: "شماره پذیرش", key: "receptionNumber", width: 14 },
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
      // The shop's own number, not the primary key — what is written on the
      // intake slip and quoted over the phone. The two were the same value
      // until 2.9.
      receptionNumber: device.receptionNumber,
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
      stock: item.currentStock.toNumber(),
      minStock: item.minStock.toNumber(),
      avgPrice: item.avgPurchasePrice.toNumber(),
      sellPrice: item.sellPrice.toNumber(),
    })),
  );

  addSheet(
    book,
    "موجودی انبارها",
    [
      { header: "انبار", key: "warehouse", width: 20 },
      { header: "کد کالا", key: "code", width: 18 },
      { header: "نام کالا", key: "name", width: 34 },
      { header: "واحد", key: "unit", width: 10 },
      { header: "موجودی", key: "quantity", width: 12 },
      { header: "محل نگهداری", key: "location", width: 16 },
      {
        header: "میانگین قیمت خرید",
        key: "avgPrice",
        width: 18,
        numFmt: MONEY,
      },
      { header: "ارزش موجودی", key: "value", width: 18, numFmt: MONEY },
    ],
    stocks.map((stock) => {
      const quantity = stock.quantity.toNumber();
      const avgPrice = stock.item.avgPurchasePrice.toNumber();
      return {
        warehouse: stock.warehouse.isActive
          ? stock.warehouse.name
          : `${stock.warehouse.name} (غیرفعال)`,
        code: stock.item.code,
        name: stock.item.name,
        unit: stock.item.unit,
        quantity,
        location: stock.location ?? "",
        avgPrice,
        value: Math.round(quantity * avgPrice * 100) / 100,
      };
    }),
  );

  addSheet(
    book,
    "فاکتور فروش",
    [
      { header: "شماره فاکتور", key: "number", width: 16 },
      { header: "مشتری", key: "customer", width: 24 },
      { header: "شماره تماس", key: "phone", width: 16 },
      { header: "تاریخ", key: "date", width: 14 },
      { header: "انبار", key: "warehouse", width: 16 },
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
      warehouse: invoice.warehouse.name,
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
      { header: "انبار", key: "warehouse", width: 16 },
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
      warehouse: invoice.warehouse.name,
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
      { header: "شماره پذیرش", key: "receptionNumber", width: 14 },
      { header: "دستگاه", key: "device", width: 24 },
      { header: "مشتری", key: "customer", width: 24 },
      { header: "تاریخ", key: "date", width: 14 },
      { header: "انبار", key: "warehouse", width: 16 },
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
      receptionNumber: invoice.device.receptionNumber,
      device: invoice.device.deviceName,
      customer: invoice.customerName,
      date: toJalali(invoice.invoiceDate),
      warehouse: invoice.warehouse.name,
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

  // One row per line of every stock adjustment (14.14): the shelf corrected
  // by hand, with the reason a shop gave and what it was worth.
  addSheet(
    book,
    "اصلاح موجودی",
    [
      { header: "شماره سند", key: "number", width: 14 },
      { header: "تاریخ", key: "date", width: 14 },
      { header: "انبار", key: "warehouse", width: 16 },
      { header: "کد کالا", key: "code", width: 18 },
      { header: "نام کالا", key: "name", width: 30 },
      { header: "مقدار", key: "quantity", width: 10 },
      { header: "واحد", key: "unit", width: 10 },
      { header: "دلیل", key: "reason", width: 16 },
      { header: "توضیح", key: "note", width: 30 },
      { header: "بهای واحد", key: "unitCost", width: 16, numFmt: MONEY },
      { header: "ارزش", key: "value", width: 16, numFmt: MONEY },
    ],
    adjustments.flatMap((adjustment) =>
      adjustment.lines.map((line) => {
        const quantity = line.quantity.toNumber();
        const unitCost = line.unitCost.toNumber();
        return {
          number: adjustment.number,
          date: toJalali(adjustment.adjustedAt),
          warehouse: adjustment.warehouse.name,
          code: line.item.code,
          name: line.item.name,
          // Signed, so a column sum is the net change.
          quantity,
          unit: line.item.unit,
          reason:
            REASON_LABELS[line.reason as keyof typeof REASON_LABELS] ??
            line.reason,
          note: line.note ?? adjustment.description ?? "",
          unitCost,
          value: Math.round(quantity * unitCost * 100) / 100,
        };
      }),
    ),
  );

  // Every counted line of every stock count (14.15), with the count's
  // status: a draft's lines are what has been counted so far, an applied
  // count's differences are what reached the ledger.
  addSheet(
    book,
    "انبارگردانی",
    [
      { header: "شماره", key: "number", width: 14 },
      { header: "وضعیت", key: "status", width: 12 },
      { header: "انبار", key: "warehouse", width: 16 },
      { header: "کد کالا", key: "code", width: 18 },
      { header: "نام کالا", key: "name", width: 30 },
      { header: "واحد", key: "unit", width: 10 },
      { header: "موجودی سیستم", key: "system", width: 14 },
      { header: "شمارش", key: "counted", width: 12 },
      { header: "اختلاف", key: "difference", width: 12 },
      { header: "تاریخ شمارش", key: "countedAt", width: 14 },
      { header: "توضیح", key: "note", width: 30 },
    ],
    stockCounts.flatMap((count) =>
      count.lines.map((line) => {
        const counted = line.countedQuantity!.toNumber();
        const system = line.systemQuantity!.toNumber();
        return {
          number: count.number,
          status: COUNT_STATUS[count.status] ?? count.status,
          warehouse: count.warehouse.name,
          code: line.item.code,
          name: line.item.name,
          unit: line.item.unit,
          system,
          counted,
          difference: Math.round((counted - system) * 1000) / 1000,
          countedAt: toJalali(line.countedAt),
          note: line.note ?? "",
        };
      }),
    ),
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
        warehouse: invoice.warehouse.name,
        code: line.item.code,
        name: line.item.name,
        quantity: line.quantity.toNumber(),
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
        warehouse: invoice.warehouse.name,
        // A custom line points at no catalogue item, so it carries the name
        // it was written with and no code.
        code: line.item?.code ?? "",
        name: line.item?.name ?? line.name ?? "",
        quantity: line.quantity.toNumber(),
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
        warehouse: invoice.warehouse.name,
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
      { header: "انبار", key: "warehouse", width: 16 },
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
