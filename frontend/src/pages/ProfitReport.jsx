// src/pages/ProfitReport.jsx
import { useState, useEffect } from "react";
import { getProfitReport } from "../api";
import toast from "react-hot-toast";
import {
  ArrowRightIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ChartPieIcon,
} from "@heroicons/react/24/solid";
import PersianDatePicker from "../components/PersianDatePicker";
import { useModal } from "../context/ModalContext";

export default function ProfitReport() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const { openItemDetail } = useModal();
  const [dateRange, setDateRange] = useState({
    from_date: "",
    to_date: "",
  });

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = () => {
    setLoading(true);
    const params = {};
    if (dateRange.from_date) params.from_date = dateRange.from_date;
    if (dateRange.to_date) params.to_date = dateRange.to_date;

    getProfitReport(params)
      .then((res) => setReport(res.data))
      .catch(() => toast.error("خطا در دریافت گزارش"))
      .finally(() => setLoading(false));
  };

  const formatCurrency = (amount) => Number(amount || 0).toLocaleString();
  const formatPercent = (value) => Number(value || 0).toFixed(1) + "%";

  return (
    <div dir="rtl" className=" mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex gap-2">
          <ChartPieIcon className="w-6 h-6 text-gray-600" />
          گزارش سود و زیان
        </h1>
      </div>

      {/* Date Filters */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-600 mb-1">از تاریخ</label>
            <PersianDatePicker
              value={dateRange.from_date}
              onChange={(val) =>
                setDateRange((prev) => ({ ...prev, from_date: val }))
              }
              placeholder="از تاریخ"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">تا تاریخ</label>
            <PersianDatePicker
              value={dateRange.to_date}
              onChange={(val) =>
                setDateRange((prev) => ({ ...prev, to_date: val }))
              }
              placeholder="تا تاریخ"
            />
          </div>
          <button
            onClick={fetchReport}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
          >
            اعمال فیلتر
          </button>
        </div>
      </div>

      {/* Summary */}
      {report && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 rounded-lg shadow p-4 border border-blue-200">
              <p className="text-sm text-blue-700">کل فروش</p>
              <p className="text-2xl font-bold text-blue-800">
                {formatCurrency(report.summary.total_revenue)} ریال
              </p>
            </div>
            <div className="bg-orange-50 rounded-lg shadow p-4 border border-orange-200">
              <p className="text-sm text-orange-700">هزینه کل</p>
              <p className="text-2xl font-bold text-orange-800">
                {formatCurrency(report.summary.total_cost)} ریال
              </p>
            </div>
            <div
              className={`rounded-lg shadow p-4 border ${report.summary.total_profit >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}
            >
              <p
                className={`text-sm ${report.summary.total_profit >= 0 ? "text-green-700" : "text-red-700"}`}
              >
                سود خالص
              </p>
              <p
                className={`text-2xl font-bold ${report.summary.total_profit >= 0 ? "text-green-800" : "text-red-800"}`}
              >
                {formatCurrency(report.summary.total_profit)} ریال
              </p>
            </div>
            <div
              className={`rounded-lg shadow p-4 border ${report.summary.profit_margin >= 0 ? "bg-purple-50 border-purple-200" : "bg-gray-50 border-gray-200"}`}
            >
              <p className="text-sm text-purple-700">حاشیه سود</p>
              <p className="text-2xl font-bold text-purple-800">
                {formatPercent(report.summary.profit_margin)}
              </p>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className=" bg-gradient-to-r from-indigo-50 to-blue-50">
                <tr>
                  <th className="px-4 py-3 text-right  font-semibold text-indigo-700">
                    کد
                  </th>
                  <th className="px-4 py-3 text-right  font-semibold text-indigo-700">
                    نام کالا
                  </th>
                  <th className="px-4 py-3 text-right  font-semibold text-indigo-700">
                    تعداد فروش
                  </th>
                  <th className="px-4 py-3 text-right  font-semibold text-indigo-700">
                    درآمد
                  </th>
                  <th className="px-4 py-3 text-right  font-semibold text-indigo-700">
                    هزینه
                  </th>
                  <th className="px-4 py-3 text-right  font-semibold text-indigo-700">
                    سود
                  </th>
                  <th className="px-4 py-3 text-right  font-semibold text-indigo-700">
                    حاشیه سود
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {report.data.map((item) => (
                  <tr key={item.item_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono">
                      {item.item_code}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => openItemDetail(item.item_id)}
                        className="text-blue-600 hover:underline"
                      >
                        {item.item_name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm">{item.total_quantity}</td>
                    <td className="px-4 py-3 text-sm">
                      {formatCurrency(item.total_revenue)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {formatCurrency(item.total_cost)}
                    </td>
                    <td
                      className={`px-4 py-3 text-sm font-medium ${item.profit >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {formatCurrency(item.profit)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`flex items-center gap-1 ${item.profit_margin >= 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        {item.profit_margin >= 0 ? (
                          <ArrowTrendingUpIcon className="w-4 h-4" />
                        ) : (
                          <ArrowTrendingDownIcon className="w-4 h-4" />
                        )}
                        {formatPercent(item.profit_margin)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
