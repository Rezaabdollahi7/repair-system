import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { toGregorian, toJalaali } from "jalaali-js";
import { ArrowPathRoundedSquareIcon } from "@heroicons/react/24/outline";
import { MagnifyingGlassIcon } from "@heroicons/react/24/solid";
import { getCategories, getMovementReport } from "../api";
import PersianDatePicker from "../components/PersianDatePicker";
import { errorText } from "../utils/errors";
import { formatQuantity, toPersianDigits } from "../utils/formatters";
import { useWarehouses } from "../utils/warehouses";
import {
  searchField,
  searchIcon,
  secondaryButton,
  tableCard,
  tableScroll,
  tbody,
  td,
  tdMuted,
  th,
  thead,
  toolbarSelect,
  trClickable,
} from "../utils/tableClasses";
import type {
  Category,
  MovementReport as MovementReportData,
  MovementReportRow,
  QueryParams,
} from "../types/api";

/** The first day of this Jalali month, as the Gregorian date the API takes. */
function jalaliMonthStart(now: Date = new Date()): string {
  const { jy, jm } = toJalaali(now);
  const { gy, gm, gd } = toGregorian(jy, jm, 1);
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

/** An unsigned movement: the figure, or nothing when nothing moved. */
function Moved({ value, tone }: { value: number; tone: "in" | "out" }) {
  if (!value) return <span className="text-text-muted">·</span>;
  return (
    <span
      className={`tabular-nums ${tone === "in" ? "text-success-fg" : "text-danger-fg"}`}
    >
      {formatQuantity(value)}
    </span>
  );
}

/**
 * A signed movement. Laid out left to right so the sign sits on the left
 * of the digits, as numbers are written even in Persian text — in an RTL
 * cell the bidi algorithm would otherwise carry a «−» to the far side.
 */
function Signed({ value }: { value: number }) {
  if (!value) return <span className="text-text-muted">·</span>;
  return (
    <span
      dir="ltr"
      className={`tabular-nums ${value > 0 ? "text-success-fg" : "text-danger-fg"}`}
    >
      {value > 0 ? "+" : "−"}
      {formatQuantity(Math.abs(value))}
    </span>
  );
}

/**
 * گردش کالا (14.21): for each item, what it held when the period began,
 * what came in and went out during it by kind, and what it held at the
 * end. By document date. A row opens the item's kardex for the detail.
 */
export default function MovementReport() {
  const navigate = useNavigate();
  const warehouses = useWarehouses();
  const [fromDate, setFromDate] = useState(jalaliMonthStart);
  const [toDate, setToDate] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [movedOnly, setMovedOnly] = useState(false);
  const [report, setReport] = useState<MovementReportData | null>(null);

  useEffect(() => {
    getCategories()
      .then((res) => setCategories(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params: QueryParams = {};
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;
    if (warehouseId) params.warehouse_id = warehouseId;
    if (categoryId) params.category_id = categoryId;
    getMovementReport(params)
      .then((res) => {
        if (!cancelled) setReport(res.data);
      })
      .catch((error) => {
        if (!cancelled)
          toast.error(errorText(error, "خطا در دریافت گزارش گردش کالا"));
      });
    return () => {
      cancelled = true;
    };
  }, [fromDate, toDate, warehouseId, categoryId]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (report?.data ?? []).filter(
      (row) =>
        (!movedOnly || row.moved) &&
        (!needle ||
          row.name.toLowerCase().includes(needle) ||
          row.code.toLowerCase().includes(needle)),
    );
  }, [report, search, movedOnly]);

  // Transfers net to nothing for a one-warehouse shop: no columns for them.
  const showTransfers = warehouses.showPicker;
  // Reversals and returns are rare; a column of dots says nothing.
  const showOther = rows.some((row) => row.other !== 0);
  const open = (row: MovementReportRow) =>
    navigate(`/items/${row.item_id}?tab=kardex`);

  return (
    <div dir="rtl" className="space-y-4">
      <p className="text-body-sm text-text-secondary leading-7">
        موجودی هر کالا در ابتدای بازه، ورود و خروج آن به تفکیک نوع حرکت، و
        موجودی پایان بازه — بر اساس تاریخ سند. با کلیک روی هر ردیف، کاردکس آن
        کالا باز می‌شود.
      </p>

      <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-end gap-3">
        <div className="lg:w-44">
          <label className="block text-body-xs text-text-secondary mb-1">
            از تاریخ
          </label>
          <PersianDatePicker
            value={fromDate}
            onChange={setFromDate}
            placeholder="از ابتدا"
            clearable
          />
        </div>
        <div className="lg:w-44">
          <label className="block text-body-xs text-text-secondary mb-1">
            تا تاریخ
          </label>
          <PersianDatePicker
            value={toDate}
            onChange={setToDate}
            placeholder="تا امروز"
            clearable
          />
        </div>
        {warehouses.showPicker && (
          <div className="lg:w-44">
            <label className="block text-body-xs text-text-secondary mb-1">
              انبار
            </label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              aria-label="انبار"
              className={`${toolbarSelect} w-full`}
            >
              <option value="">همه انبارها</option>
              {warehouses.warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="lg:w-44">
          <label className="block text-body-xs text-text-secondary mb-1">
            دسته‌بندی
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label="دسته‌بندی"
            className={`${toolbarSelect} w-full`}
          >
            <option value="">همه دسته‌ها</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="relative flex-1 min-w-[12rem]">
          <MagnifyingGlassIcon className={searchIcon} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجوی نام یا کد کالا..."
            aria-label="جستجو"
            className={searchField}
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-body-sm text-text-primary h-10">
          <input
            type="checkbox"
            checked={movedOnly}
            onChange={(e) => setMovedOnly(e.target.checked)}
            className="w-4 h-4 accent-[var(--primary)] cursor-pointer"
          />
          فقط کالاهای دارای حرکت
        </label>
        {(fromDate !== jalaliMonthStart() || toDate) && (
          <button
            onClick={() => {
              setFromDate(jalaliMonthStart());
              setToDate("");
            }}
            className={`${secondaryButton} flex-none`}
          >
            ماه جاری
          </button>
        )}
      </div>

      {report === null ? (
        <div className="animate-pulse h-64 rounded-panel border border-border bg-surface" />
      ) : rows.length === 0 ? (
        <div className="bg-surface border border-border rounded-panel flex flex-col items-center justify-center text-center py-16 px-4">
          <span className="w-14 h-14 rounded-panel bg-surface-alt flex items-center justify-center mb-4">
            <ArrowPathRoundedSquareIcon
              className="w-7 h-7 text-text-muted"
              aria-hidden="true"
            />
          </span>
          <p className="text-body-md font-bold text-text-primary">
            در این بازه کالایی برای نمایش نیست
          </p>
          <p className="text-body-sm text-text-secondary mt-1 max-w-sm">
            بازه‌ی تاریخ یا فیلترها را تغییر دهید.
          </p>
        </div>
      ) : (
        <>
          <p className="text-body-xs text-text-muted">
            {toPersianDigits(rows.length)} کالا
            {report.summary.moved_count !== report.summary.item_count &&
              ` — ${toPersianDigits(report.summary.moved_count)} کالا در این بازه حرکت داشته‌اند`}
          </p>
          <div className={tableCard}>
            <div className={tableScroll}>
              <table className="w-full min-w-[60rem]">
                <thead className={thead}>
                  <tr>
                    <th className={th}>کالا</th>
                    <th className={th}>مانده اول</th>
                    <th
                      className={th}
                      title="موجودی‌ای که هنگام تعریف کالا ثبت شد"
                    >
                      ثبت اولیه
                    </th>
                    <th className={th}>خرید</th>
                    <th className={th}>فروش</th>
                    <th className={th}>مصرف تعمیر</th>
                    {showTransfers && <th className={th}>انتقال ورود</th>}
                    {showTransfers && <th className={th}>انتقال خروج</th>}
                    <th className={th} title="اصلاح موجودی و انبارگردانی">
                      اصلاح و شمارش
                    </th>
                    {showOther && (
                      <th className={th} title="برگشت سند و مرجوعی‌ها">
                        سایر
                      </th>
                    )}
                    <th className={th}>مانده پایان</th>
                  </tr>
                </thead>
                <tbody className={tbody}>
                  {rows.map((row) => (
                    <tr
                      key={row.item_id}
                      onClick={() => open(row)}
                      className={trClickable}
                    >
                      <td className={td}>
                        <span className="block font-bold">{row.name}</span>
                        <span
                          className="block text-body-xs text-text-muted"
                          dir="ltr"
                        >
                          {row.code}
                        </span>
                      </td>
                      <td className={`${tdMuted} tabular-nums`}>
                        {formatQuantity(row.opening)}
                      </td>
                      <td className={td}>
                        <Moved value={row.initial} tone="in" />
                      </td>
                      <td className={td}>
                        <Moved value={row.purchase} tone="in" />
                      </td>
                      <td className={td}>
                        <Moved value={row.sale} tone="out" />
                      </td>
                      <td className={td}>
                        <Moved value={row.repair_use} tone="out" />
                      </td>
                      {showTransfers && (
                        <td className={td}>
                          <Moved value={row.transfer_in} tone="in" />
                        </td>
                      )}
                      {showTransfers && (
                        <td className={td}>
                          <Moved value={row.transfer_out} tone="out" />
                        </td>
                      )}
                      <td className={td}>
                        <Signed value={row.correction} />
                      </td>
                      {showOther && (
                        <td className={td}>
                          <Signed value={row.other} />
                        </td>
                      )}
                      <td className={`${td} font-bold tabular-nums`}>
                        {formatQuantity(row.closing)}{" "}
                        <span className="text-body-xs font-normal text-text-muted">
                          {row.unit}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
