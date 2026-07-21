// src/pages/TransactionsReport.jsx
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getDashboardStats } from "../api";
import toast from "react-hot-toast";
import { ArrowRightIcon } from "@heroicons/react/24/solid";

export default function TransactionsReport() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardStats()
      .then((res) => setTransactions(res.data.recent_transactions || []))
      .catch(() => toast.error("خطا در دریافت تراکنش‌ها"))
      .finally(() => setLoading(false));
  }, []);

  const getTypeLabel = (type) => {
    if (type === "purchase")
      return { label: "خرید", color: "text-success", bg: "bg-success-soft" };
    if (type === "sale")
      return { label: "فروش", color: "text-danger", bg: "bg-danger-soft" };
    return {
      label: "تنظیم",
      color: "text-text-secondary",
      bg: "bg-surface-alt",
    };
  };

  return (
    <div dir="rtl" className="px-2 sm:px-0 max-w-7xl mx-auto">
      <div className="mb-4 sm:mb-6">
        <Link
          to="/dashboard"
          className="text-text-secondary hover:text-text-primary flex items-center gap-1 mb-2 text-sm sm:text-base"
        >
          <ArrowRightIcon className="w-3 h-3 sm:w-4 sm:h-4" />
          بازگشت به داشبورد
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">
          گزارش تراکنش‌ها
        </h1>
      </div>

      {loading ? (
        <div className="text-center py-10 text-sm sm:text-base text-text-secondary">
          در حال بارگذاری...
        </div>
      ) : (
        <div className="bg-surface shadow rounded-lg overflow-hidden overflow-x-auto">
          <table className="min-w-[640px] sm:min-w-full divide-y divide-border">
            <thead className="bg-surface-alt">
              <tr>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-text-secondary">
                  تاریخ
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-text-secondary">
                  نوع
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-text-secondary">
                  کالا
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-text-secondary">
                  تعداد
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-text-secondary">
                  قیمت واحد
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-text-secondary">
                  جمع
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions.map((tx) => {
                const typeInfo = getTypeLabel(tx.type);
                return (
                  <tr key={tx.id} className="hover:bg-surface-alt">
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-text-primary">
                      {new Date(tx.created_at).toLocaleDateString("fa-IR")}
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3">
                      <span
                        className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs ${typeInfo.bg} ${typeInfo.color}`}
                      >
                        {typeInfo.label}
                      </span>
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                      <Link
                        to={`/items/${tx.item_id}`}
                        className="text-primary hover:underline break-words"
                      >
                        [{tx.item_code}] {tx.item_name}
                      </Link>
                    </td>
                    <td
                      className={`px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium ${tx.quantity > 0 ? "text-success" : "text-danger"}`}
                    >
                      {tx.quantity > 0 ? "+" : ""}
                      {tx.quantity}
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-text-primary">
                      {tx.unit_price
                        ? Number(tx.unit_price).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-text-primary">
                      {tx.unit_price
                        ? Number(
                            Math.abs(tx.quantity) * tx.unit_price,
                          ).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
