import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getDashboardStats } from "../api";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { ArrowRightIcon, ClockIcon } from "@heroicons/react/24/solid";
import { useModal } from "../context/ModalContext";
import StatusPill from "../components/StatusPill";
import {
  formatPersianCurrency,
  formatPersianDate,
  toPersianDigits,
} from "../utils/formatters";
import { staggerContainer, staggerItem } from "../motion";
import {
  rowCard,
  tableCard,
  tableScroll,
  tbody,
  td,
  tdBare,
  tdMuted,
  th,
  thead,
  trClickable,
} from "../utils/tableClasses";
import type { DashboardTransaction } from "../types/api";

/**
 * What kind of movement a row is.
 *
 * Stock coming in is green and stock going out is red, which is the shop's
 * reading rather than an accountant's: a sale is good for the books and bad
 * for the shelf, and this page is about the shelf. The «تنظیم» case is a
 * manual correction and takes the neutral.
 */
const TYPES: Record<string, { label: string; color: string; tone: string }> = {
  purchase: {
    label: "خرید",
    color: "var(--success)",
    tone: "bg-success-soft text-success-fg",
  },
  sale: {
    label: "فروش",
    color: "var(--danger)",
    tone: "bg-danger-soft text-danger-fg",
  },
};

const ADJUSTMENT = {
  label: "تنظیم",
  color: "var(--text-muted)",
  tone: "bg-surface-alt text-text-secondary",
};

function typeOf(type: string) {
  return TYPES[type] ?? ADJUSTMENT;
}

function TransactionsSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="hidden lg:block bg-surface border border-border rounded-panel p-5">
        <div className="h-4 w-full rounded-field bg-surface-alt mb-5" />
        {Array.from({ length: 8 }, (_, row) => (
          <div key={row} className="flex gap-3 mb-4">
            {[2, 2, 5, 2, 3, 3].map((span, cell) => (
              <div
                key={cell}
                className="h-4 rounded-field bg-surface-alt"
                style={{ flexGrow: span, flexBasis: 0 }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="lg:hidden space-y-3">
        {[0, 1, 2, 3].map((card) => (
          <div
            key={card}
            className="h-28 rounded-panel border border-border bg-surface"
          />
        ))}
      </div>
    </div>
  );
}

export default function TransactionsReport() {
  // Reads the dashboard's recent_transactions, which the controller caps at
  // ten rows — so this page shows the same handful the dashboard already
  // does, not a full transaction history.
  const [transactions, setTransactions] = useState<DashboardTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const { openItemDetail } = useModal();

  useEffect(() => {
    getDashboardStats()
      .then((res) => setTransactions(res.data.recent_transactions))
      .catch(() => toast.error("خطا در دریافت تراکنش‌ها"))
      .finally(() => setLoading(false));
  }, []);

  const lineTotal = (tx: DashboardTransaction) =>
    tx.unit_price ? Math.abs(tx.quantity) * tx.unit_price : null;

  return (
    <div dir="rtl">
      <header className="mb-5">
        {/*
          This page is not in the sidebar — it is reached from the dashboard's
          «مشاهده همه», so it keeps a way back that the other pages get from
          the nav.
        */}
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 text-body-sm text-text-secondary
                     hover:text-text-primary transition-colors mb-3"
        >
          <ArrowRightIcon className="w-4 h-4" aria-hidden="true" />
          بازگشت به داشبورد
        </Link>
      </header>

      {loading ? (
        <TransactionsSkeleton />
      ) : transactions.length === 0 ? (
        <div className="bg-surface border border-border rounded-panel flex flex-col items-center justify-center text-center py-16 px-4">
          <span className="w-14 h-14 rounded-panel bg-surface-alt flex items-center justify-center mb-4">
            <ClockIcon className="w-7 h-7 text-text-muted" aria-hidden="true" />
          </span>
          <p className="text-body-md font-bold text-text-primary">
            هنوز تراکنشی ثبت نشده
          </p>
          <p className="text-body-sm text-text-secondary mt-1 max-w-sm">
            هر خرید، فروش یا تنظیم موجودی یک حرکت اینجا می‌سازد.
          </p>
        </div>
      ) : (
        <>
          {/* Below lg the table becomes one card per movement — six columns
              needed 640px, which a phone had to be dragged across. */}
          <motion.ul
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="lg:hidden space-y-3"
          >
            {transactions.map((tx) => {
              const kind = typeOf(tx.type);
              const incoming = tx.quantity > 0;
              return (
                <motion.li key={tx.id} variants={staggerItem}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openItemDetail(tx.item_id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openItemDetail(tx.item_id);
                      }
                    }}
                    className={`${rowCard} cursor-pointer hover:border-border-strong
                                relative overflow-hidden ps-5`}
                  >
                    <span
                      className="absolute inset-y-0 start-0 w-1.5"
                      style={{ backgroundColor: kind.color }}
                      aria-hidden="true"
                    />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-body-sm font-bold text-text-primary truncate">
                          {tx.item_name}
                        </p>
                        <p
                          className="text-body-xs text-text-muted tabular-nums"
                          dir="ltr"
                        >
                          {tx.item_code}
                        </p>
                      </div>
                      <StatusPill
                        label={kind.label}
                        color={kind.color}
                        tone={kind.tone}
                        size="sm"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-border-subtle">
                      <span className="text-body-xs text-text-muted">
                        {formatPersianDate(tx.created_at)}
                      </span>
                      <span
                        className={`text-body-sm font-bold tabular-nums ${
                          incoming ? "text-success-fg" : "text-danger-fg"
                        }`}
                      >
                        {incoming ? "+" : "−"}
                        {toPersianDigits(Math.abs(tx.quantity))} عدد
                      </span>
                    </div>

                    {lineTotal(tx) !== null && (
                      <p className="text-body-xs text-text-muted mt-2 tabular-nums">
                        {formatPersianCurrency(tx.unit_price)} × ‏
                        {toPersianDigits(Math.abs(tx.quantity))} ={" "}
                        {formatPersianCurrency(lineTotal(tx))} ریال
                      </p>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </motion.ul>

          <div className={`hidden lg:block ${tableCard}`}>
            <div className={tableScroll}>
              <table className="min-w-[820px] w-full">
                <thead className={thead}>
                  <tr>
                    <th className={th}>تاریخ</th>
                    <th className={th}>نوع</th>
                    <th className={th}>کالا</th>
                    <th className={th}>تعداد</th>
                    <th className={th}>قیمت واحد (ریال)</th>
                    <th className={th}>جمع (ریال)</th>
                  </tr>
                </thead>
                <tbody className={tbody}>
                  {transactions.map((tx) => {
                    const kind = typeOf(tx.type);
                    const incoming = tx.quantity > 0;
                    return (
                      <tr
                        key={tx.id}
                        onClick={() => openItemDetail(tx.item_id)}
                        className={trClickable}
                      >
                        <td
                          className={tdMuted}
                          style={{
                            boxShadow: `inset -3px 0 0 0 ${kind.color}`,
                          }}
                        >
                          {formatPersianDate(tx.created_at)}
                        </td>
                        <td className={tdBare}>
                          <StatusPill
                            label={kind.label}
                            color={kind.color}
                            tone={kind.tone}
                            size="sm"
                          />
                        </td>
                        {/*
                          A modal, not a link. This was `<Link to={"/items/" +
                          id}>` and there is no such route — the app has never
                          had an item page, only the detail modal every other
                          list opens. The link went nowhere.
                        */}
                        <td className={`${td} font-bold text-primary`}>
                          {tx.item_name}
                          <span className="text-text-muted font-normal ms-2">
                            {tx.item_code}
                          </span>
                        </td>
                        <td
                          className={`${tdBare} font-bold tabular-nums ${
                            incoming ? "text-success-fg" : "text-danger-fg"
                          }`}
                        >
                          {incoming ? "+" : "−"}
                          {toPersianDigits(Math.abs(tx.quantity))}
                        </td>
                        <td className={`${tdMuted} tabular-nums`}>
                          {tx.unit_price
                            ? formatPersianCurrency(tx.unit_price)
                            : "—"}
                        </td>
                        <td className={`${td} tabular-nums`}>
                          {lineTotal(tx) !== null
                            ? formatPersianCurrency(lineTotal(tx))
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
