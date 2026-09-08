import { useState, useEffect } from "react";
import { getStockReport, getCategories } from "../api";
import toast from "react-hot-toast";
import { useModal } from "../context/ModalContext";
import { formatPersianCurrency, toPersianDigits } from "../utils/formatters";
import {
  th,
  thead,
} from "../utils/tableClasses";
import type {
  Category,
  QueryParams,
  StockReport as StockReportData,
  StockStatus,
} from "../types/api";

interface StockFilters {
  categoryId: string;
  lowStockOnly: boolean;
}

export default function StockReport() {
  const [report, setReport] = useState<StockReportData | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<StockFilters>({
    categoryId: "",
    lowStockOnly: false,
  });

  // Read from the URL rather than a route param: the dashboard's low-stock
  // warning links straight here with the filter already applied.
  const searchParams = new URLSearchParams(window.location.search);
  const lowStockParam = searchParams.get("lowStock") === "true";

  const { openItemDetail } = useModal();

  useEffect(() => {
    if (lowStockParam) {
      setFilters((prev) => ({ ...prev, lowStockOnly: true }));
    }

    getCategories()
      .then((res) => setCategories(res.data))
      .catch(() => {});

    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lowStockParam]);

  const fetchReport = () => {
    setLoading(true);
    const params: QueryParams = {};
    if (filters.categoryId) params.categoryId = filters.categoryId;
    if (filters.lowStockOnly) params.lowStockOnly = true;

    getStockReport(params)
      .then((res) => setReport(res.data))
      .catch(() => toast.error("خطا در دریافت گزارش"))
      .finally(() => setLoading(false));
  };

  const handleFilterChange = <K extends keyof StockFilters>(
    key: K,
    value: StockFilters[K],
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    fetchReport();
  };

  const getStockStatusBadge = (status: StockStatus) => {
    if (status === "critical") {
      return (
        <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-danger-soft text-danger-fg rounded-full text-body-xs">
          اتمام موجودی
        </span>
      );
    }
    if (status === "low") {
      return (
        <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-warning-soft text-warning-fg rounded-full text-body-xs">
          کم‌موجود
        </span>
      );
    }
    return (
      <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-success-soft text-success-fg rounded-full text-body-xs">
        موجودی کافی
      </span>
    );
  };

  return (
    <div dir="rtl" className="px-2 sm:px-0 mx-auto">
      <div className="bg-surface shadow rounded-field p-3 sm:p-4 mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-start sm:items-end">
          <div className="w-full sm:w-auto">
            <label className="block text-body-xs text-text-secondary mb-1">
              دسته‌بندی
            </label>
            <select
              value={filters.categoryId}
              onChange={(e) => handleFilterChange("categoryId", e.target.value)}
              className="w-full sm:w-auto border border-border rounded-field px-3 py-2 text-body-sm bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow]"
            >
              <option value="">همه</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.lowStockOnly}
                onChange={(e) =>
                  handleFilterChange("lowStockOnly", e.target.checked)
                }
                className="w-4 h-4 text-primary border-border rounded focus:ring-primary"
              />
              <span className="text-body-xs sm:text-body-sm text-text-primary">
                فقط کالاهای کم‌موجود
              </span>
            </label>
          </div>
          <button
            onClick={applyFilters}
            className="bg-primary text-primary-fg px-4 py-2 rounded-field hover:bg-primary-hover text-body-sm w-full sm:w-auto"
          >
            اعمال فیلتر
          </button>
        </div>
      </div>

      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-surface rounded-field shadow p-3 sm:p-4">
            <p className="text-body-xs sm:text-body-sm text-text-secondary">کل کالاها</p>
            <p className="text-lg sm:text-2xl font-bold text-text-primary">
              {toPersianDigits(report.summary.total_items)}
            </p>
          </div>
          <div className="bg-warning-soft rounded-field shadow p-3 sm:p-4 border border-warning-soft">
            <p className="text-body-xs sm:text-body-sm text-warning-fg">کم‌موجود</p>
            <p className="text-lg sm:text-2xl font-bold text-warning-fg">
              {toPersianDigits(report.summary.low_stock_count)}
            </p>
          </div>
          <div className="bg-danger-soft rounded-field shadow p-3 sm:p-4 border border-danger-soft">
            <p className="text-body-xs sm:text-body-sm text-danger-fg">اتمام موجودی</p>
            <p className="text-lg sm:text-2xl font-bold text-danger-fg">
              {toPersianDigits(report.summary.critical_count)}
            </p>
          </div>
          <div className="bg-primary-soft rounded-field shadow p-3 sm:p-4 border border-primary-soft">
            <p className="text-body-xs sm:text-body-sm text-primary">ارزش کل موجودی</p>
            <p className="text-base sm:text-xl font-bold text-primary break-words">
              {formatPersianCurrency(report.summary.total_inventory_value)} ریال
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-body-sm sm:text-base text-text-secondary">
          در حال بارگذاری...
        </div>
      ) : (
        <div className="bg-surface shadow rounded-field overflow-hidden overflow-x-auto">
          <table className="min-w-[720px] sm:min-w-full divide-y divide-border">
            <thead className={thead}>
              <tr>
                <th className={th}>
                  کد
                </th>
                <th className={th}>
                  نام کالا
                </th>
                <th className={th}>
                  دسته‌بندی
                </th>
                <th className={th}>
                  موجودی
                </th>
                <th className={th}>
                  حداقل
                </th>
                <th className={th}>
                  وضعیت
                </th>
                <th className={th}>
                  ارزش موجودی
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {report?.data.map((item) => (
                <tr key={item.id} className="hover:bg-surface-alt">
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-body-xs sm:text-body-sm font-mono text-center text-text-primary">
                    {item.code}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-body-xs sm:text-body-sm text-center">
                    <button
                      onClick={() => openItemDetail(item.id)}
                      className="text-primary hover:underline"
                    >
                      {item.name}
                    </button>
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-body-xs sm:text-body-sm text-text-secondary text-center">
                    {item.category_name || "—"}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-body-xs sm:text-body-sm font-medium text-center text-text-primary">
                    {item.current_stock} {item.unit}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-body-xs sm:text-body-sm text-text-secondary text-center">
                    {item.min_stock} {item.unit}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-center">
                    {getStockStatusBadge(item.stock_status)}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-body-xs sm:text-body-sm text-center border-border text-text-primary">
                    {formatPersianCurrency(
                      item.current_stock * item.avg_purchase_price,
                    )}{" "}
                    ریال
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
