import { useState, useEffect } from "react";
import { getProfitReport } from "../api";
import toast from "react-hot-toast";
import { ArrowTrendingUpIcon } from "@heroicons/react/24/solid";
import PersianDatePicker from "../components/PersianDatePicker";
import { useModal } from "../context/ModalContext";
import { formatPersianCurrency } from "../utils/formatters";
import {
  th,
  thead,
} from "../utils/tableClasses";
import type {
  ProfitReport as ProfitReportData,
  QueryParams,
} from "../types/api";

export default function ProfitReport() {
  const [report, setReport] = useState<ProfitReportData | null>(null);
  const [, setLoading] = useState(true);
  const { openItemDetail } = useModal();
  const [dateRange, setDateRange] = useState({
    from_date: "",
    to_date: "",
  });

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchReport = () => {
    setLoading(true);
    const params: QueryParams = {};
    if (dateRange.from_date) params.from_date = dateRange.from_date;
    if (dateRange.to_date) params.to_date = dateRange.to_date;

    getProfitReport(params)
      .then((res) => setReport(res.data))
      .catch(() => toast.error("خطا در دریافت گزارش"))
      .finally(() => setLoading(false));
  };

  const formatPercent = (value: number) => Number(value || 0).toFixed(1) + "%";

  return (
    <div dir="rtl" className="px-2 sm:px-0 mx-auto">
      <div className="bg-surface shadow rounded-field p-3 sm:p-4 mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-start sm:items-end">
          <div className="w-full sm:w-auto">
            <label className="block text-body-xs text-text-secondary mb-1">
              از تاریخ
            </label>
            <PersianDatePicker
              value={dateRange.from_date}
              onChange={(val) =>
                setDateRange((prev) => ({ ...prev, from_date: val }))
              }
              placeholder="از تاریخ"
            />
          </div>
          <div className="w-full sm:w-auto">
            <label className="block text-body-xs text-text-secondary mb-1">
              تا تاریخ
            </label>
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
            className="bg-primary text-primary-fg px-4 py-2 rounded-field hover:bg-primary-hover text-body-sm w-full sm:w-auto"
          >
            اعمال فیلتر
          </button>
        </div>
      </div>

      {report && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
            <div className="bg-primary-soft rounded-field shadow p-3 sm:p-4 border border-primary-soft">
              <p className="text-body-xs sm:text-body-sm text-primary">کل فروش</p>
              <p className="text-lg sm:text-2xl font-bold text-primary break-words">
                {formatPersianCurrency(report.summary.total_revenue)} ریال
              </p>
            </div>
            <div className="bg-warning-soft rounded-field shadow p-3 sm:p-4 border border-warning-soft">
              <p className="text-body-xs sm:text-body-sm text-warning-fg">هزینه کل</p>
              <p className="text-lg sm:text-2xl font-bold text-warning-fg break-words">
                {formatPersianCurrency(report.summary.total_cost)} ریال
              </p>
            </div>
            <div
              className={`rounded-field shadow p-3 sm:p-4 border ${report.summary.total_profit >= 0 ? "bg-success-soft border-success-soft" : "bg-danger-soft border-danger-soft"}`}
            >
              <p
                className={`text-body-xs sm:text-body-sm ${report.summary.total_profit >= 0 ? "text-success-fg" : "text-danger-fg"}`}
              >
                سود خالص
              </p>
              <p
                className={`text-lg sm:text-2xl font-bold ${report.summary.total_profit >= 0 ? "text-success-fg" : "text-danger-fg"} break-words`}
              >
                {formatPersianCurrency(report.summary.total_profit)} ریال
              </p>
            </div>
            <div
              className={`rounded-field shadow p-3 sm:p-4 border ${report.summary.profit_margin >= 0 ? "bg-primary-soft border-primary-soft" : "bg-surface-alt border-border"}`}
            >
              <p className="text-body-xs sm:text-body-sm text-primary">حاشیه سود</p>
              <p className="text-lg sm:text-2xl font-bold text-primary">
                {formatPercent(report.summary.profit_margin)}
              </p>
            </div>
          </div>

          <div className="bg-surface shadow rounded-field overflow-hidden overflow-x-auto">
            <table className="min-w-[640px] sm:min-w-full divide-y divide-border">
              <thead className={thead}>
                <tr>
                  <th className={th}>
                    کد
                  </th>
                  <th className={th}>
                    نام کالا
                  </th>
                  <th className={th}>
                    تعداد فروش
                  </th>
                  <th className={th}>
                    درآمد
                  </th>
                  <th className={th}>
                    هزینه
                  </th>
                  <th className={th}>
                    سود
                  </th>
                  <th className={th}>
                    حاشیه سود
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.data.map((item) => (
                  <tr key={item.item_id} className="hover:bg-surface-alt">
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-body-xs sm:text-body-sm font-mono text-center text-text-primary">
                      {item.item_code}
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-body-xs sm:text-body-sm text-center">
                      <button
                        onClick={() => {
                          if (item.item_id) openItemDetail(item.item_id);
                        }}
                        className="text-primary hover:underline"
                      >
                        {item.item_name}
                      </button>
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-body-xs sm:text-body-sm text-center text-text-primary">
                      {item.total_quantity}
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-body-xs sm:text-body-sm text-center text-text-primary">
                      {formatPersianCurrency(item.total_revenue)}
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-body-xs sm:text-body-sm text-center text-text-primary">
                      {formatPersianCurrency(item.total_cost)}
                    </td>
                    <td
                      className={`px-3 sm:px-4 py-2 sm:py-3 text-body-xs sm:text-body-sm font-medium text-center ${item.profit >= 0 ? "text-success-fg" : "text-danger-fg"}`}
                    >
                      {formatPersianCurrency(item.profit)}
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-body-xs sm:text-body-sm border-border">
                      <span
                        className={`flex items-center gap-1 justify-center ${item.profit_margin >= 0 ? "text-success-fg" : "text-danger-fg"}`}
                      >
                        <ArrowTrendingUpIcon className="w-3 h-3 sm:w-4 sm:h-4" />
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
