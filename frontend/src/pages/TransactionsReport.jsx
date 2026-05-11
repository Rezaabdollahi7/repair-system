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
      return { label: "خرید", color: "text-green-600", bg: "bg-green-100" };
    if (type === "sale")
      return { label: "فروش", color: "text-red-600", bg: "bg-red-100" };
    return { label: "تنظیم", color: "text-gray-600", bg: "bg-gray-100" };
  };

  return (
    <div dir="rtl" className="px-2 sm:px-0 max-w-7xl mx-auto">
      <div className="mb-4 sm:mb-6">
        <Link
          to="/dashboard"
          className="text-gray-600 hover:text-gray-900 flex items-center gap-1 mb-2 text-sm sm:text-base"
        >
          <ArrowRightIcon className="w-3 h-3 sm:w-4 sm:h-4" />
          بازگشت به داشبورد
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          گزارش تراکنش‌ها
        </h1>
      </div>

      {loading ? (
        <div className="text-center py-10 text-sm sm:text-base">
          در حال بارگذاری...
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden overflow-x-auto">
          <table className="min-w-[640px] sm:min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-gray-500">
                  تاریخ
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-gray-500">
                  نوع
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-gray-500">
                  کالا
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-gray-500">
                  تعداد
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-gray-500">
                  قیمت واحد
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-gray-500">
                  جمع
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {transactions.map((tx) => {
                const typeInfo = getTypeLabel(tx.type);
                return (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
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
                        className="text-blue-600 hover:underline break-words"
                      >
                        [{tx.item_code}] {tx.item_name}
                      </Link>
                    </td>
                    <td
                      className={`px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium ${tx.quantity > 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {tx.quantity > 0 ? "+" : ""}
                      {tx.quantity}
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                      {tx.unit_price
                        ? Number(tx.unit_price).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
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
