import { useEffect, useState, useCallback, useRef } from "react";
import { getPurchaseInvoices, deletePurchaseInvoice } from "../api";
import Pagination from "../components/Pagination";
import ConfirmModal from "../components/ConfirmModal";
import { useModal } from "../context/ModalContext";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { motion } from "framer-motion";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  ShoppingCartIcon,
} from "@heroicons/react/24/solid";
/* Outline for the row's own controls — a solid heroicon at 18px is a disc. */
import { EyeIcon, TrashIcon } from "@heroicons/react/24/outline";
import PaymentStatusBadge from "../components/PaymentStatusBadge";
import { PAYMENT_STATUSES, paymentStatusOf } from "../utils/invoiceStatus";
import { staggerContainer, staggerItem } from "../motion";
import {
  formatPersianCurrency,
  formatPersianDate,
  toPersianDigits,
} from "../utils/formatters";
import { useDebounce } from "../utils/helpers";
import {
  iconButton,
  rowCard,
  primaryButton,
  secondaryButton,
  searchField,
  searchIcon,
  tableCard,
  tableScroll,
  tbody,
  td,
  tdBare,
  tdMuted,
  th,
  thead,
  toolbar,
  toolbarActions,
  toolbarSearch,
  trClickable,
} from "../utils/tableClasses";
import type { PaymentStatus, PurchaseInvoice, QueryParams } from "../types/api";

/** Mirrors the table and the phone cards so the page does not jump. */
function InvoiceListSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="hidden lg:block bg-surface border border-border rounded-panel p-5">
        <div className="h-4 w-full rounded-field bg-surface-alt mb-5" />
        {Array.from({ length: 8 }, (_, row) => (
          <div key={row} className="flex gap-3 mb-4">
            {[3, 4, 3, 2, 3, 3].map((span, cell) => (
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
            className="h-32 rounded-panel border border-border bg-surface"
          />
        ))}
      </div>
    </div>
  );
}

export default function PurchaseInvoiceList() {
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus[]>([]);
  const { isAtLeast } = useAuth();
  const { openPurchaseInvoiceDetail, openPurchaseInvoiceCreate, refreshList } =
    useModal();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseInvoice | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const debouncedSearch = useDebounce(searchInput, 400);

  const fetchInvoices = useCallback(
    async (
      searchTerm: string,
      payment: PaymentStatus[],
      currentPage: number,
      currentLimit: number,
    ) => {
      setLoading(true);
      try {
        const params: QueryParams = { page: currentPage, limit: currentLimit };
        // The list filters on the supplier's name, not a general search.
        if (searchTerm) params.supplier = searchTerm;
        if (payment.length > 0) params.payment_status = payment.join(",");

        const res = await getPurchaseInvoices(params);
        setInvoices(res.data.data);
        setTotal(res.data.total);
        setTotalPages(res.data.totalPages);
      } catch {
        toast.error("خطا در دریافت لیست فاکتورها");
        setInvoices([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchInvoices(debouncedSearch, paymentFilter, page, limit);
  }, [debouncedSearch, paymentFilter, page, limit, fetchInvoices]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch, paymentFilter]);

  useEffect(() => {
    refreshList(() => {
      void fetchInvoices(debouncedSearch, paymentFilter, page, limit);
    });
  }, [refreshList, fetchInvoices, debouncedSearch, paymentFilter, page, limit]);

  /*
   * Row actions, shared by the table row and the phone card. Neutral until
   * hovered: they used to carry a tint each, which put a coloured square on
   * every line beside a row that already states its payment status.
   */
  const actionButton = `${iconButton} text-text-muted hover:text-text-primary hover:bg-surface-alt`;

  const rowActions = (invoice: PurchaseInvoice) => (
    <div className="flex gap-1 justify-end items-center">
      <button
        onClick={(e) => {
          e.stopPropagation();
          openPurchaseInvoiceDetail(invoice.id);
        }}
        className={actionButton}
        title="مشاهده جزئیات"
      >
        <EyeIcon className="w-[1.15rem] h-[1.15rem]" />
      </button>
      {isAtLeast("admin") && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setDeleteTarget(invoice);
          }}
          className={`${iconButton} text-text-muted hover:text-danger-fg hover:bg-danger-soft`}
          title="حذف"
        >
          <TrashIcon className="w-[1.15rem] h-[1.15rem]" />
        </button>
      )}
    </div>
  );

  const filtering = debouncedSearch !== "" || paymentFilter.length > 0;

  return (
    <div dir="rtl">
      <header className="mb-5">
        <h1 className="text-headline-md font-bold text-text-primary">
          فاکتورهای خرید
        </h1>
        <p className="text-body-sm text-text-secondary mt-0.5">
          {loading
            ? "در حال بارگذاری…"
            : filtering
              ? `${toPersianDigits(total)} نتیجه از این فیلتر`
              : `${toPersianDigits(total)} فاکتور خرید ثبت شده`}
        </p>

        {/*
          Payment-state chips, the same control the sales list has. The
          purchases endpoint had no such filter until now, which is why this
          page could not offer one — «چه چیزی را هنوز بدهکاریم» is the question
          it exists to answer.

          Multi-select: pending and partial together is "anything still owed".
        */}
        <div
          className="flex gap-2 mt-4 overflow-x-auto pb-1
                     sm:flex-wrap sm:overflow-x-visible sm:pb-0"
          role="group"
          aria-label="فیلتر وضعیت پرداخت"
        >
          <button
            onClick={() => {
              setPaymentFilter([]);
              setPage(1);
            }}
            aria-pressed={paymentFilter.length === 0}
            className={`shrink-0 px-3 py-1.5 rounded-pill text-body-xs font-bold border
                        transition-colors cursor-pointer ${
                          paymentFilter.length === 0
                            ? "bg-primary text-primary-fg border-primary"
                            : "bg-surface text-text-secondary border-border hover:border-border-strong"
                        }`}
          >
            همه
          </button>
          {PAYMENT_STATUSES.map((status) => {
            const active = paymentFilter.includes(status.key);
            return (
              <button
                key={status.key}
                onClick={() => {
                  setPaymentFilter((current) =>
                    current.includes(status.key)
                      ? current.filter((value) => value !== status.key)
                      : [...current, status.key],
                  );
                  setPage(1);
                }}
                aria-pressed={active}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill
                            text-body-xs font-bold border transition-colors cursor-pointer
                            ${
                              active
                                ? "text-text-primary"
                                : "bg-surface text-text-secondary border-border hover:border-border-strong"
                            }`}
                style={
                  active
                    ? {
                        backgroundColor: `color-mix(in oklab, ${status.color} 16%, var(--surface))`,
                        borderColor: `color-mix(in oklab, ${status.color} 55%, var(--surface))`,
                      }
                    : undefined
                }
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: status.color }}
                  aria-hidden="true"
                />
                {status.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className={toolbar}>
        <div className={toolbarSearch}>
          <MagnifyingGlassIcon className={searchIcon} />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="جستجو در نام فروشنده…"
            aria-label="جستجوی فاکتور خرید"
            className={searchField}
          />
        </div>

        <div className={toolbarActions}>
          <button
            onClick={() => openPurchaseInvoiceCreate()}
            className={primaryButton}
          >
            <PlusIcon className="w-[1.15rem] h-[1.15rem]" />
            فاکتور جدید
          </button>
        </div>
      </div>

      {loading ? (
        <InvoiceListSkeleton />
      ) : invoices.length === 0 ? (
        <div className="bg-surface border border-border rounded-panel flex flex-col items-center justify-center text-center py-16 px-4">
          <span className="w-14 h-14 rounded-panel bg-surface-alt flex items-center justify-center mb-4">
            <ShoppingCartIcon
              className="w-7 h-7 text-text-muted"
              aria-hidden="true"
            />
          </span>
          <p className="text-body-md font-bold text-text-primary">
            {filtering ? "نتیجه‌ای یافت نشد" : "هنوز فاکتور خریدی ثبت نشده"}
          </p>
          <p className="text-body-sm text-text-secondary mt-1 max-w-sm">
            {filtering
              ? "این ترکیب فیلترها چیزی برنگرداند. یکی از آن‌ها را بردارید."
              : "قطعاتی که می‌خرید را اینجا ثبت کنید تا موجودی انبار به‌روز بماند."}
          </p>
          {filtering ? (
            <button
              onClick={() => {
                setSearchInput("");
                setPaymentFilter([]);
                setPage(1);
              }}
              className={`${secondaryButton} mt-5 flex-none`}
            >
              پاک‌کردن جستجو و فیلترها
            </button>
          ) : (
            <button
              onClick={() => openPurchaseInvoiceCreate()}
              className={`${primaryButton} mt-5 flex-none`}
            >
              <PlusIcon
                className="w-[1.15rem] h-[1.15rem]"
                aria-hidden="true"
              />
              فاکتور جدید
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Below lg the table becomes one card per invoice — eight columns
              needed 1040px, which a phone had to be dragged across. */}
          <motion.ul
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="lg:hidden space-y-3"
          >
            {invoices.map((invoice) => {
              const remaining = invoice.total_amount - invoice.paid_amount;
              const status = paymentStatusOf(invoice.payment_status);
              return (
                <motion.li key={invoice.id} variants={staggerItem}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openPurchaseInvoiceDetail(invoice.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openPurchaseInvoiceDetail(invoice.id);
                      }
                    }}
                    className={`${rowCard} cursor-pointer hover:border-border-strong
                                relative overflow-hidden ps-5`}
                  >
                    <span
                      className="absolute inset-y-0 start-0 w-1.5"
                      style={{ backgroundColor: status.color }}
                      aria-hidden="true"
                    />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-body-sm font-bold text-text-primary truncate">
                          {invoice.supplier_name || "فروشندهٔ نامشخص"}
                        </p>
                        <p className="text-body-xs text-text-muted">
                          {formatPersianDate(invoice.invoice_date)}
                        </p>
                      </div>
                      <span
                        className="text-body-xs text-text-muted shrink-0 tabular-nums"
                        dir="ltr"
                      >
                        {invoice.invoice_number}
                      </span>
                    </div>

                    <div className="mt-3">
                      <PaymentStatusBadge status={invoice.payment_status} />
                    </div>

                    {/*
                      The three money figures side by side. «مانده» is the one
                      a shop acts on, so it keeps the danger tone the table
                      gives it — and only while there is something left to
                      collect.
                    */}
                    <dl className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border-subtle">
                      <div>
                        <dt className="text-body-xs text-text-muted">
                          مبلغ کل
                        </dt>
                        <dd className="text-body-sm font-bold text-text-primary tabular-nums">
                          {formatPersianCurrency(invoice.total_amount)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-body-xs text-text-muted">
                          پرداخت‌شده
                        </dt>
                        <dd
                          className={`text-body-sm font-bold tabular-nums ${
                            invoice.paid_amount > 0
                              ? "text-success-fg"
                              : "text-text-muted"
                          }`}
                        >
                          {invoice.paid_amount > 0
                            ? formatPersianCurrency(invoice.paid_amount)
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-body-xs text-text-muted">مانده</dt>
                        <dd
                          className={`text-body-sm font-bold tabular-nums ${
                            remaining > 0
                              ? "text-danger-fg"
                              : "text-text-secondary"
                          }`}
                        >
                          {remaining > 0
                            ? formatPersianCurrency(remaining)
                            : "—"}
                        </dd>
                      </div>
                    </dl>

                    <div className="flex items-center justify-end mt-3">
                      {rowActions(invoice)}
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </motion.ul>

          <div className={`hidden lg:block ${tableCard}`}>
            <div className={tableScroll}>
              <table className="min-w-[1040px] w-full">
                <thead className={thead}>
                  <tr>
                    <th className={th}>شماره فاکتور</th>
                    <th className={th}>فروشنده</th>
                    <th className={th}>تاریخ</th>
                    <th className={th}>مبلغ کل (ریال)</th>
                    <th className={th}>پرداخت شده (ریال)</th>
                    <th className={th}>مانده (ریال)</th>
                    <th className={th}>وضعیت</th>
                    <th className={th}>عملیات</th>
                  </tr>
                </thead>
                <tbody className={tbody}>
                  {invoices.map((invoice) => {
                    const remaining =
                      invoice.total_amount - invoice.paid_amount;
                    return (
                      <tr
                        key={invoice.id}
                        onClick={() => openPurchaseInvoiceDetail(invoice.id)}
                        className={trClickable}
                      >
                        <td className={`${td} tabular-nums`}>
                          {invoice.invoice_number}
                        </td>
                        <td className={td}>{invoice.supplier_name || "—"}</td>
                        <td className={tdMuted}>
                          {formatPersianDate(invoice.invoice_date)}
                        </td>
                        <td className={td}>
                          {formatPersianCurrency(invoice.total_amount)}
                        </td>
                        {/* Green only once something has actually come in: a
                          zero in success green reads as "collected". */}
                        <td
                          className={`${tdBare} ${
                            invoice.paid_amount > 0
                              ? "text-success-fg"
                              : "text-text-muted"
                          }`}
                        >
                          {invoice.paid_amount > 0
                            ? formatPersianCurrency(invoice.paid_amount)
                            : "—"}
                        </td>
                        <td className={`${tdBare} text-danger-fg`}>
                          {remaining > 0
                            ? formatPersianCurrency(remaining)
                            : "—"}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <PaymentStatusBadge
                            status={invoice.payment_status}
                            size="sm"
                          />
                        </td>
                        <td className="px-3 py-3">{rowActions(invoice)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!loading && invoices.length > 0 && (
        <div className="mt-4">
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={(newLimit) => {
              setLimit(newLimit);
              setPage(1);
            }}
          />
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          setDeleting(true);
          try {
            if (!deleteTarget) return;
            await deletePurchaseInvoice(deleteTarget.id);
            toast.success("فاکتور حذف شد");
            setDeleteTarget(null);
            fetchInvoices(debouncedSearch, paymentFilter, page, limit);
          } catch {
            toast.error("خطا در حذف فاکتور");
          } finally {
            setDeleting(false);
          }
        }}
        title="حذف فاکتور خرید"
        message={`آیا از حذف فاکتور "${deleteTarget?.invoice_number}" مطمئن هستید؟\nموجودی کالاها به حالت قبل برمی‌گردد.`}
        confirmText="حذف"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
