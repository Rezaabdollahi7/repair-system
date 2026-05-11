// src/pages/StockReport.jsx
import { useState, useEffect } from "react";
import { getStockReport, getCategories } from "../api";
import toast from "react-hot-toast";
import {
  ArrowRightIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/solid";
import { useModal } from "../context/ModalContext";
import { formatPersianCurrency } from "../utils/formatters";

export default function StockReport() {
  const [report, setReport] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    categoryId: "",
    lowStockOnly: false,
  });

  const searchParams = new URLSearchParams(window.location.search);
  const lowStockParam = searchParams.get("lowStock") === "true";

  const { openItemDetail } = useModal();

  useEffect(() => {
    if (lowStockParam) {
      setFilters((prev) => ({ ...prev, lowStockOnly: true }));
    }

    getCategories()
      .then((res) => setCategories(res.data?.data || res.data || []))
      .catch(() => {});

    fetchReport();
  }, [lowStockParam]);

  const fetchReport = () => {
    setLoading(true);
    const params = {};
    if (filters.categoryId) params.categoryId = filters.categoryId;
    if (filters.lowStockOnly) params.lowStockOnly = true;

    getStockReport(params)
      .then((res) => setReport(res.data))
      .catch(() => toast.error("خطا در دریافت گزارش"))
      .finally(() => setLoading(false));
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    fetchReport();
  };

  const getStockStatusBadge = (status) => {
    if (status === "critical") {
      return (
        <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-red-100 text-red-800 rounded-full text-xs">
          اتمام موجودی
        </span>
      );
    }
    if (status === "low") {
      return (
        <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">
          کم‌موجود
        </span>
      );
    }
    return (
      <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-green-100 text-green-800 rounded-full text-xs">
        موجودی کافی
      </span>
    );
  };

  return (
    <div dir="rtl" className="px-2 sm:px-0 mx-auto">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex gap-2 items-center">
          <ChartBarIcon className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600" />
          گزارش موجودی انبار
        </h1>
      </div>

      <div className="bg-white shadow rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-start sm:items-end">
          <div className="w-full sm:w-auto">
            <label className="block text-xs text-gray-600 mb-1">
              دسته‌بندی
            </label>
            <select
              value={filters.categoryId}
              onChange={(e) => handleFilterChange("categoryId", e.target.value)}
              className="w-full sm:w-auto border border-gray-300 rounded-lg px-3 py-2 text-sm"
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
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-xs sm:text-sm text-gray-700">
                فقط کالاهای کم‌موجود
              </span>
            </label>
          </div>
          <button
            onClick={applyFilters}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm w-full sm:w-auto"
          >
            اعمال فیلتر
          </button>
        </div>
      </div>

      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-white rounded-lg shadow p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-gray-600">کل کالاها</p>
            <p className="text-lg sm:text-2xl font-bold">
              {report.summary.total_items}
            </p>
          </div>
          <div className="bg-yellow-50 rounded-lg shadow p-3 sm:p-4 border border-yellow-200">
            <p className="text-xs sm:text-sm text-yellow-700">کم‌موجود</p>
            <p className="text-lg sm:text-2xl font-bold text-yellow-800">
              {report.summary.low_stock_count}
            </p>
          </div>
          <div className="bg-red-50 rounded-lg shadow p-3 sm:p-4 border border-red-200">
            <p className="text-xs sm:text-sm text-red-700">اتمام موجودی</p>
            <p className="text-lg sm:text-2xl font-bold text-red-800">
              {report.summary.critical_count}
            </p>
          </div>
          <div className="bg-blue-50 rounded-lg shadow p-3 sm:p-4 border border-blue-200">
            <p className="text-xs sm:text-sm text-blue-700">ارزش کل موجودی</p>
            <p className="text-base sm:text-xl font-bold text-blue-800 break-words">
              {formatPersianCurrency(report.summary.total_inventory_value)} ریال
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-sm sm:text-base">
          در حال بارگذاری...
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden overflow-x-auto">
          <table className="min-w-[720px] sm:min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-indigo-50 to-blue-50">
              <tr>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right font-semibold text-indigo-700 text-xs sm:text-sm">
                  کد
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right font-semibold text-indigo-700 text-xs sm:text-sm">
                  نام کالا
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right font-semibold text-indigo-700 text-xs sm:text-sm">
                  دسته‌بندی
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right font-semibold text-indigo-700 text-xs sm:text-sm">
                  موجودی
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right font-semibold text-indigo-700 text-xs sm:text-sm">
                  حداقل
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right font-semibold text-indigo-700 text-xs sm:text-sm">
                  وضعیت
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right font-semibold text-indigo-700 text-xs sm:text-sm">
                  ارزش موجودی
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {report?.data.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-mono">
                    {item.code}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                    <button
                      onClick={() => openItemDetail(item.id)}
                      className="text-blue-600 hover:underline"
                    >
                      {item.name}
                    </button>
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-600">
                    {item.category_name || "—"}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium">
                    {item.current_stock} {item.unit}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-600">
                    {item.min_stock} {item.unit}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3">
                    {getStockStatusBadge(item.stock_status)}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
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
