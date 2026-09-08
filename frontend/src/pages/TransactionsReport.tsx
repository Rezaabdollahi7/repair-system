import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getDashboardStats } from "../api";
import toast from "react-hot-toast";
import { ArrowRightIcon } from "@heroicons/react/24/solid";
import {
  th,
} from "../utils/tableClasses";
import type { DashboardTransaction } from "../types/api";

export default function TransactionsReport() {
  // Reads the dashboard's recent_transactions, which the controller caps at
  // ten rows — so this page shows the same handful the dashboard already
  // does, not a full transaction history.
  const [transactions, setTransactions] = useState<DashboardTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardStats()
      .then((res) => setTransactions(res.data.recent_transactions))
      .catch(() => toast.error("خطا در دریافت تراکنش‌ها"))
      .finally(() => setLoading(false));
  }, []);

  const getTypeLabel = (type: string) => {
    if (type === "purchase")
      return { label: "خرید", color: "text-success-fg", bg: "bg-success-soft" };
    if (type === "sale")
      return { label: "فروش", color: "text-danger-fg", bg: "bg-danger-soft" };
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
          className="text-text-secondary hover:text-text-primary flex items-center gap-1 mb-2 text-body-sm sm:text-base"
        >
          <ArrowRightIcon className="w-3 h-3 sm:w-4 sm:h-4" />
          بازگشت به داشبورد
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-10 text-body-sm sm:text-base text-text-secondary">
          در حال بارگذاری...
        </div>
      ) : (
        <div className="bg-surface shadow rounded-field overflow-hidden overflow-x-auto">
          <table className="min-w-[640px] sm:min-w-full divide-y divide-border">
            <thead className="bg-surface-alt">
              <tr>
                <th className={`${th} !text-right`}>
                  تاریخ
                </th>
                <th className={`${th} !text-right`}>
                  نوع
                </th>
                <th className={`${th} !text-right`}>
                  کالا
                </th>
                <th className={`${th} !text-right`}>
                  تعداد
                </th>
                <th className={`${th} !text-right`}>
                  قیمت واحد
                </th>
                <th className={`${th} !text-right`}>
                  جمع
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions.map((tx) => {
                const typeInfo = getTypeLabel(tx.type);
                return (
                  <tr key={tx.id} className="hover:bg-surface-alt">
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-body-xs sm:text-body-sm text-text-primary">
                      {new Date(tx.created_at).toLocaleDateString("fa-IR")}
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3">
                      <span
                        className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-body-xs ${typeInfo.bg} ${typeInfo.color}`}
                      >
                        {typeInfo.label}
                      </span>
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-body-xs sm:text-body-sm">
                      <Link
                        to={`/items/${tx.item_id}`}
                        className="text-primary hover:underline break-words"
                      >
                        [{tx.item_code}] {tx.item_name}
                      </Link>
                    </td>
                    <td
                      className={`px-3 sm:px-4 py-2 sm:py-3 text-body-xs sm:text-body-sm font-medium ${tx.quantity > 0 ? "text-success-fg" : "text-danger-fg"}`}
                    >
                      {tx.quantity > 0 ? "+" : ""}
                      {tx.quantity}
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-body-xs sm:text-body-sm text-text-primary">
                      {tx.unit_price
                        ? Number(tx.unit_price).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-body-xs sm:text-body-sm text-text-primary">
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
