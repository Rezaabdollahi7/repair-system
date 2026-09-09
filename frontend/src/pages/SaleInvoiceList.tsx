import { useEffect, useState, useCallback, useRef } from "react";
import { getSaleInvoices, deleteSaleInvoice } from "../api";
import Pagination from "../components/Pagination";
import ConfirmModal from "../components/ConfirmModal";
import { useModal } from "../context/ModalContext";
import {
  formatPersianCurrency,
  formatPersianDate,
  formatPersianPhone,
  toPersianDigits,
} from "../utils/formatters";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { motion } from "framer-motion";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  CurrencyDollarIcon,
} from "@heroicons/react/24/solid";
/* Outline for the row's own controls — a solid heroicon at 18px is a disc. */
import {
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import PaymentStatusBadge from "../components/PaymentStatusBadge";
import { PAYMENT_STATUSES, paymentStatusOf } from "../utils/invoiceStatus";
import { staggerContainer, staggerItem } from "../motion";
import SaleInvoiceFilterPanel from "../components/SaleInvoiceFilterPanel";
import { useDebounce } from "../utils/helpers";
import {
  actionDelete,
  actionEdit,
  actionView,
  primaryButton,
  rowCard,
  searchField,
  searchIcon,
  secondaryButton,
  tableCard,
  tableScroll,
  tbody,
  td,
  tdActions,
  tdBare,
  tdMuted,
  th,
  thead,
  toolbar,
  toolbarActions,
  toolbarSearch,
  trClickable,
} from "../utils/tableClasses";
import type { SaleInvoiceFilters } from "../components/SaleInvoiceFilterPanel";
import type { PaymentStatus, QueryParams, SaleInvoice } from "../types/api";

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
            className="h-36 rounded-panel border border-border bg-surface"
          />
        ))}
      </div>
    </div>
  );
}

const EMPTY_FILTERS: SaleInvoiceFilters = {
  payment_status: [],
  date_from: "",
  date_to: "",
  amount_from: "",
  amount_to: "",
};

export default function SaleInvoiceList() {
  const [invoices, setInvoices] = useState<SaleInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<SaleInvoiceFilters>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const { isAtLeast } = useAuth();
  const {
    openSaleInvoiceDetail,
    openSaleInvoiceCreate,
    openSaleInvoiceEdit,
    openCustomerDetail,
    refreshList,
  } = useModal();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<SaleInvoice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const debouncedSearch = useDebounce(searchInput, 400);

  const activeFilterCount = Object.values(filters).filter((v) =>
    Array.isArray(v) ? v.length > 0 : v !== "",
  ).length;

  const fetchInvoices = useCallback(
    async (
      searchTerm: string,
      activeFilters: SaleInvoiceFilters,
      currentPage: number,
      currentLimit: number,
    ) => {
      setLoading(true);
      try {
        const params: QueryParams = { page: currentPage, limit: currentLimit };
        if (searchTerm) params.search = searchTerm;

        if (activeFilters.payment_status.length > 0) {
          params.payment_status = activeFilters.payment_status.join(",");
        }
        if (activeFilters.date_from) params.date_from = activeFilters.date_from;
        if (activeFilters.date_to) params.date_to = activeFilters.date_to;
        if (activeFilters.amount_from)
          params.amount_from = activeFilters.amount_from;
        if (activeFilters.amount_to) params.amount_to = activeFilters.amount_to;

        const res = await getSaleInvoices(params);
        setInvoices(res.data.data);
        setTotal(res.data.total);
        setTotalPages(res.data.totalPages);
      } catch {
        toast.error("خطا در دریافت لیست فاکتورهای فروش");
        setInvoices([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchInvoices(debouncedSearch, filters, page, limit);
  }, [debouncedSearch, filters, page, limit, fetchInvoices]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch, filters]);

  useEffect(() => {
    refreshList(() => {
      void fetchInvoices(debouncedSearch, filters, page, limit);
    });
  }, [refreshList, fetchInvoices, debouncedSearch, filters, page, limit]);

  const filtering = debouncedSearch !== "" || activeFilterCount > 0;

  /**
   * Adds or removes one payment status from the filter.
   *
   * Writes into the same `filters.payment_status` array the filter panel uses
   * rather than keeping a second piece of state — and stays multi-select for
   * the same reason the panel is: «هرچه وصول نشده» is pending and partial
   * together, which is the question a shop chasing money actually asks.
   */
  const togglePaymentStatus = (key: PaymentStatus) => {
    setFilters((current) => ({
      ...current,
      payment_status: current.payment_status.includes(key)
        ? current.payment_status.filter((value) => value !== key)
        : [...current.payment_status, key],
    }));
    setPage(1);
  };

  /*
   * Row actions, shared by the table row and the phone card. Neutral until
   * hovered: three tinted squares on every line competed with the payment
   * badge, which is the colour the row is meant to be read by.
   */

  const rowActions = (invoice: SaleInvoice) => (
    <div className="flex gap-1 justify-end items-center">
      <button
        onClick={(e) => {
          e.stopPropagation();
          openSaleInvoiceDetail(invoice.id);
        }}
        className={actionView}
        title="مشاهده جزئیات"
      >
        <EyeIcon className="w-[1.15rem] h-[1.15rem]" />
      </button>
      {isAtLeast("admin") && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              openSaleInvoiceEdit(invoice.id);
            }}
            className={actionEdit}
            title="ویرایش فاکتور"
          >
            <PencilSquareIcon className="w-[1.15rem] h-[1.15rem]" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(invoice);
            }}
            className={actionDelete}
            title="حذف"
          >
            <TrashIcon className="w-[1.15rem] h-[1.15rem]" />
          </button>
        </>
      )}
    </div>
  );

  return (
    <div dir="rtl">
      <header className="mb-5">
        <div
          className="flex gap-2 mt-4 overflow-x-auto pb-1
                     sm:flex-wrap sm:overflow-x-visible sm:pb-0"
          role="group"
          aria-label="فیلتر وضعیت پرداخت"
        >
          <button
            onClick={() => {
              setFilters((current) => ({ ...current, payment_status: [] }));
              setPage(1);
            }}
            aria-pressed={filters.payment_status.length === 0}
            className={`shrink-0 px-3 py-1.5 rounded-pill text-body-xs font-bold border
                        transition-colors cursor-pointer ${
                          filters.payment_status.length === 0
                            ? "bg-primary text-primary-fg border-primary"
                            : "bg-surface text-text-secondary border-border hover:border-border-strong"
                        }`}
          >
            همه
          </button>
          {PAYMENT_STATUSES.map((status) => {
            const active = filters.payment_status.includes(status.key);
            return (
              <button
                key={status.key}
                onClick={() => togglePaymentStatus(status.key)}
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
            placeholder="جستجو در شماره فاکتور، نام مشتری یا تلفن…"
            aria-label="جستجوی فاکتور فروش"
            className={searchField}
          />
        </div>

        <div className={toolbarActions}>
          <button
            onClick={() => setFilterOpen(true)}
            className={secondaryButton}
          >
            <FunnelIcon className="w-[1.15rem] h-[1.15rem] text-text-secondary" />
            فیلترها
            {activeFilterCount > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-pill bg-primary text-primary-fg text-body-xs flex items-center justify-center">
                {toPersianDigits(activeFilterCount)}
              </span>
            )}
          </button>
          <button
            onClick={() => openSaleInvoiceCreate()}
            className={primaryButton}
          >
            <PlusIcon className="w-[1.15rem] h-[1.15rem]" />
            فاکتور جدید
          </button>
        </div>
      </div>

      {/* Filter panel */}
      <SaleInvoiceFilterPanel
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onChange={(newFilters) => {
          setFilters(newFilters);
          setPage(1);
        }}
        onClear={() => {
          setFilters(EMPTY_FILTERS);
          setPage(1);
        }}
      />

      {loading ? (
        <InvoiceListSkeleton />
      ) : invoices.length === 0 ? (
        <div className="bg-surface border border-border rounded-panel flex flex-col items-center justify-center text-center py-16 px-4">
          <span className="w-14 h-14 rounded-panel bg-surface-alt flex items-center justify-center mb-4">
            <CurrencyDollarIcon
              className="w-7 h-7 text-text-muted"
              aria-hidden="true"
            />
          </span>
          <p className="text-body-md font-bold text-text-primary">
            {filtering ? "نتیجه‌ای یافت نشد" : "هنوز فاکتور فروشی ثبت نشده"}
          </p>
          <p className="text-body-sm text-text-secondary mt-1 max-w-sm">
            {filtering
              ? "این ترکیب فیلترها چیزی برنگرداند. یکی از آن‌ها را بردارید."
              : "فروش قطعات به مشتری از اینجا فاکتور می‌شود."}
          </p>
          {filtering ? (
            <button
              onClick={() => {
                setSearchInput("");
                setFilters(EMPTY_FILTERS);
                setPage(1);
              }}
              className={`${secondaryButton} mt-5 flex-none`}
            >
              پاک‌کردن جستجو و فیلترها
            </button>
          ) : (
            <button
              onClick={() => openSaleInvoiceCreate()}
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
          {/* Below lg the table becomes one card per invoice — nine columns
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
                    onClick={() => openSaleInvoiceDetail(invoice.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openSaleInvoiceDetail(invoice.id);
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
                          {invoice.customer_name || "مشتری متفرقه"}
                        </p>
                        <p
                          className="text-body-xs text-text-muted tabular-nums"
                          dir="ltr"
                        >
                          {formatPersianPhone(invoice.customer_phone)}
                        </p>
                      </div>
                      <span
                        className="text-body-xs text-text-muted shrink-0 tabular-nums"
                        dir="ltr"
                      >
                        {invoice.invoice_number}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <PaymentStatusBadge status={invoice.payment_status} />
                      <span className="text-body-xs text-text-muted">
                        {formatPersianDate(invoice.invoice_date)}
                      </span>
                    </div>

                    {/*
                      The three money figures side by side. «مانده» is the one
                      a shop acts on, so it keeps the danger tone the table
                      gives it — and only while something is left to collect.
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
              <table className="min-w-[1120px] w-full">
                <thead className={thead}>
                  <tr>
                    <th className={th}>شماره فاکتور</th>
                    <th className={th}>مشتری</th>
                    <th className={th}>تلفن</th>
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
                        onClick={() => openSaleInvoiceDetail(invoice.id)}
                        className={trClickable}
                      >
                        <td className={`${td} tabular-nums`}>
                          {invoice.invoice_number}
                        </td>
                        <td className={td}>
                          {invoice.customer_id ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (invoice.customer_id)
                                  openCustomerDetail(invoice.customer_id);
                              }}
                              className="text-primary hover:underline font-medium"
                            >
                              {invoice.customer_name || "—"}
                            </button>
                          ) : (
                            <span className="text-text-primary">
                              {invoice.customer_name || "—"}
                            </span>
                          )}
                        </td>
                        <td className={tdMuted}>
                          {formatPersianPhone(invoice.customer_phone)}
                        </td>
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
                        <td className={tdBare}>
                          <PaymentStatusBadge
                            status={invoice.payment_status}
                            size="sm"
                          />
                        </td>
                        <td className={tdActions}>{rowActions(invoice)}</td>
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
            await deleteSaleInvoice(deleteTarget.id);
            toast.success("فاکتور حذف شد");
            setDeleteTarget(null);
            fetchInvoices(debouncedSearch, filters, page, limit);
          } catch {
            toast.error("خطا در حذف فاکتور");
          } finally {
            setDeleting(false);
          }
        }}
        title="حذف فاکتور فروش"
        message={`آیا از حذف فاکتور "${deleteTarget?.invoice_number}" مطمئن هستید؟\nموجودی کالاها به حالت قبل برمی‌گردد.`}
        confirmText="حذف"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
