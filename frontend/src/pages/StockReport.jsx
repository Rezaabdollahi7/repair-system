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
    // Set initial filter from URL
    if (lowStockParam) {
      setFilters((prev) => ({ ...prev, lowStockOnly: true }));
    }

    // Fetch categories
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
        <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs">
          اتمام موجودی
        </span>
      );
    }
    if (status === "low") {
      return (
        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">
          کم‌موجود
        </span>
      );
    }
    return (
      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
        موجودی کافی
      </span>
    );
  };

  return (
    <div dir="rtl" className=" mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex gap-2">
          <ChartBarIcon className="w-6 h-6 text-gray-600" />
          گزارش موجودی انبار
        </h1>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-600 mb-1">
              دسته‌بندی
            </label>
            <select
              value={filters.categoryId}
              onChange={(e) => handleFilterChange("categoryId", e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
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
              <span className="text-sm text-gray-700">
                فقط کالاهای کم‌موجود
              </span>
            </label>
          </div>
          <button
            onClick={applyFilters}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
          >
            اعمال فیلتر
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {report && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">کل کالاها</p>
            <p className="text-2xl font-bold">{report.summary.total_items}</p>
          </div>
          <div className="bg-yellow-50 rounded-lg shadow p-4 border border-yellow-200">
            <p className="text-sm text-yellow-700">کم‌موجود</p>
            <p className="text-2xl font-bold text-yellow-800">
              {report.summary.low_stock_count}
            </p>
          </div>
          <div className="bg-red-50 rounded-lg shadow p-4 border border-red-200">
            <p className="text-sm text-red-700">اتمام موجودی</p>
            <p className="text-2xl font-bold text-red-800">
              {report.summary.critical_count}
            </p>
          </div>
          <div className="bg-blue-50 rounded-lg shadow p-4 border border-blue-200">
            <p className="text-sm text-blue-700">ارزش کل موجودی</p>
            <p className="text-xl font-bold text-blue-800">
              {formatPersianCurrency(report.summary.total_inventory_value)} ریال
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-10">در حال بارگذاری...</div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-indigo-50 to-blue-50">
              <tr>
                <th className="px-4 py-3 text-right  font-semibold text-indigo-700">
                  کد
                </th>
                <th className="px-4 py-3 text-right  font-semibold text-indigo-700">
                  نام کالا
                </th>
                <th className="px-4 py-3 text-right  font-semibold text-indigo-700">
                  دسته‌بندی
                </th>
                <th className="px-4 py-3 text-right  font-semibold text-indigo-700">
                  موجودی
                </th>
                <th className="px-4 py-3 text-right  font-semibold text-indigo-700">
                  حداقل
                </th>
                <th className="px-4 py-3 text-right  font-semibold text-indigo-700">
                  وضعیت
                </th>
                <th className="px-4 py-3 text-right  font-semibold text-indigo-700">
                  ارزش موجودی
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {report?.data.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono">{item.code}</td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => openItemDetail(item.id)}
                      className="text-blue-600 hover:underline"
                    >
                      {item.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {item.category_name || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium">
                    {item.current_stock} {item.unit}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {item.min_stock} {item.unit}
                  </td>
                  <td className="px-4 py-3">
                    {getStockStatusBadge(item.stock_status)}
                  </td>
                  <td className="px-4 py-3 text-sm">
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
