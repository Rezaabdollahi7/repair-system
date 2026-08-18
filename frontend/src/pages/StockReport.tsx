import { useState, useEffect } from "react";
import { getStockReport, getCategories } from "../api";
import toast from "react-hot-toast";
import { ChartBarIcon } from "@heroicons/react/24/solid";
import { useModal } from "../context/ModalContext";
import { formatPersianCurrency } from "../utils/formatters";
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
        <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-danger-soft text-danger rounded-full text-xs">
          اتمام موجودی
        </span>
      );
    }
    if (status === "low") {
      return (
        <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-warning-soft text-warning rounded-full text-xs">
          کم‌موجود
        </span>
      );
    }
    return (
      <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-success-soft text-success rounded-full text-xs">
        موجودی کافی
      </span>
    );
  };

  return (
    <div dir="rtl" className="px-2 sm:px-0 mx-auto">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary flex gap-2 items-center">
          <ChartBarIcon className="w-5 h-5 sm:w-6 sm:h-6 text-text-secondary" />
          گزارش موجودی انبار
        </h1>
      </div>

      <div className="bg-surface shadow rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-start sm:items-end">
          <div className="w-full sm:w-auto">
            <label className="block text-xs text-text-secondary mb-1">
              دسته‌بندی
            </label>
            <select
              value={filters.categoryId}
              onChange={(e) => handleFilterChange("categoryId", e.target.value)}
              className="w-full sm:w-auto border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text-primary"
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
              <span className="text-xs sm:text-sm text-text-primary">
                فقط کالاهای کم‌موجود
              </span>
            </label>
          </div>
          <button
            onClick={applyFilters}
            className="bg-primary text-text-inverse px-4 py-2 rounded-lg hover:bg-primary-hover text-sm w-full sm:w-auto"
          >
            اعمال فیلتر
          </button>
        </div>
      </div>

      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-surface rounded-lg shadow p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-text-secondary">کل کالاها</p>
            <p className="text-lg sm:text-2xl font-bold text-text-primary">
              {report.summary.total_items}
            </p>
          </div>
          <div className="bg-warning-soft rounded-lg shadow p-3 sm:p-4 border border-warning-soft">
            <p className="text-xs sm:text-sm text-warning">کم‌موجود</p>
            <p className="text-lg sm:text-2xl font-bold text-warning">
              {report.summary.low_stock_count}
            </p>
          </div>
          <div className="bg-danger-soft rounded-lg shadow p-3 sm:p-4 border border-danger-soft">
            <p className="text-xs sm:text-sm text-danger">اتمام موجودی</p>
            <p className="text-lg sm:text-2xl font-bold text-danger">
              {report.summary.critical_count}
            </p>
          </div>
          <div className="bg-primary-soft rounded-lg shadow p-3 sm:p-4 border border-primary-soft">
            <p className="text-xs sm:text-sm text-primary">ارزش کل موجودی</p>
            <p className="text-base sm:text-xl font-bold text-primary break-words">
              {formatPersianCurrency(report.summary.total_inventory_value)} ریال
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-sm sm:text-base text-text-secondary">
          در حال بارگذاری...
        </div>
      ) : (
        <div className="bg-surface shadow rounded-lg overflow-hidden overflow-x-auto">
          <table className="min-w-[720px] sm:min-w-full divide-y divide-border">
            <thead className="bg-primary-soft">
              <tr>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-center font-semibold text-text-primary border-b border-border border-l text-xs sm:text-sm">
                  کد
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-center font-semibold text-text-primary border-b border-border border-l text-xs sm:text-sm">
                  نام کالا
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-center font-semibold text-text-primary border-b border-border border-l text-xs sm:text-sm">
                  دسته‌بندی
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-center font-semibold text-text-primary border-b border-border border-l text-xs sm:text-sm">
                  موجودی
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-center font-semibold text-text-primary border-b border-border border-l text-xs sm:text-sm">
                  حداقل
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-center font-semibold text-text-primary border-b border-border border-l text-xs sm:text-sm">
                  وضعیت
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-center font-semibold text-text-primary border-b border-border text-xs sm:text-sm">
                  ارزش موجودی
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {report?.data.map((item) => (
                <tr key={item.id} className="hover:bg-surface-alt">
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-mono text-center border-l border-border text-text-primary">
                    {item.code}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-center border-l border-border">
                    <button
                      onClick={() => openItemDetail(item.id)}
                      className="text-primary hover:underline"
                    >
                      {item.name}
                    </button>
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-text-secondary text-center border-l border-border">
                    {item.category_name || "—"}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium text-center border-l border-border text-text-primary">
                    {item.current_stock} {item.unit}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-text-secondary text-center border-l border-border">
                    {item.min_stock} {item.unit}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-center border-l border-border">
                    {getStockStatusBadge(item.stock_status)}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-center border-border text-text-primary">
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
