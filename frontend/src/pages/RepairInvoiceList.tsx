import { useEffect, useState, useCallback, useRef } from "react";
import { getRepairInvoices, deleteRepairInvoice } from "../api";
import Pagination from "../components/Pagination";
import ConfirmModal from "../components/ConfirmModal";
import { useModal } from "../context/ModalContext";
import {
  formatPersianCurrency,
  formatPersianDate,
  toPersianDigits,
} from "../utils/formatters";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { motion } from "framer-motion";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/solid";
/* Outline for the row's own controls — a solid heroicon at 18px is a disc. */
import {
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import PaymentStatusBadge from "../components/PaymentStatusBadge";
import RepairInvoiceStatusBadge from "../components/RepairInvoiceStatusBadge";
import {
  REPAIR_INVOICE_STATUSES,
  repairInvoiceStatusOf,
} from "../utils/invoiceStatus";
import { staggerContainer, staggerItem } from "../motion";
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
import type { QueryParams, RepairInvoice } from "../types/api";

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

export default function RepairInvoiceList() {
  const [invoices, setInvoices] = useState<RepairInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const { isAtLeast } = useAuth();
  const {
    openRepairInvoiceDetail,
    openRepairInvoiceCreate,
    openRepairInvoiceEdit,
    openDeviceDetail,
    openCustomerDetail,
    refreshList,
  } = useModal();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<RepairInvoice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const debouncedSearch = useDebounce(searchInput, 400);

  const fetchInvoices = useCallback(
    async (
      searchTerm: string,
      status: string,
      currentPage: number,
      currentLimit: number,
    ) => {
      setLoading(true);
      try {
        const params: QueryParams = { page: currentPage, limit: currentLimit };
        if (searchTerm) params.search = searchTerm;
        if (status) params.status = status;
        const res = await getRepairInvoices(params);
        setInvoices(res.data.data);
        setTotal(res.data.total);
        setTotalPages(res.data.totalPages);
      } catch {
        toast.error("خطا در دریافت لیست فاکتورهای تعمیر");
        setInvoices([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchInvoices(debouncedSearch, statusFilter, page, limit);
  }, [debouncedSearch, statusFilter, page, limit, fetchInvoices]);

  /*
   * Back to page one when the search or the filter changes.
   *
   * This ref was here already, with nothing reading it — the effect that goes
   * with it never got written. So searching from page five asked the server
   * for page five of the new results, and a shop that found one invoice was
   * shown an empty table. The other five lists all have this.
   */
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  // Lets a modal refresh this list when the last of them closes. The other
  // five lists have always done this; without it an invoice edited or
  // cancelled from its modal left a stale row behind.
  useEffect(() => {
    refreshList(() => {
      void fetchInvoices(debouncedSearch, statusFilter, page, limit);
    });
  }, [refreshList, fetchInvoices, debouncedSearch, statusFilter, page, limit]);

  const filtering = debouncedSearch !== "" || statusFilter !== "";

  /*
   * Row actions, shared by the table row and the phone card.
   *
   * Neutral until hovered. Each of these used to carry its own tint, which
   * put three more colours in a row that already says its state twice — the
   * lifecycle badge and the payment badge — and the destructive one was a red
   * square on every line. The meaning lives in the title and in the hover.
   *
   * Only a draft can be edited, so that button is absent rather than
   * disabled on an issued invoice: a control that cannot do anything is worse
   * than no control.
   */
  const actionButton = `${iconButton} text-text-muted hover:text-text-primary hover:bg-surface-alt`;

  const rowActions = (invoice: RepairInvoice) => (
    <div className="flex gap-1 justify-end items-center">
      <button
        onClick={(e) => {
          e.stopPropagation();
          openRepairInvoiceDetail(invoice.id);
        }}
        className={actionButton}
        title="جزئیات"
      >
        <EyeIcon className="w-[1.15rem] h-[1.15rem]" />
      </button>
      {invoice.status === "draft" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            openRepairInvoiceEdit(invoice.id);
          }}
          className={actionButton}
          title="ویرایش"
        >
          <PencilSquareIcon className="w-[1.15rem] h-[1.15rem]" />
        </button>
      )}
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

  return (
    <div dir="rtl">
      <header className="mb-5">
        <h1 className="text-headline-md font-bold text-text-primary">
          فاکتورهای تعمیر
        </h1>
        <p className="text-body-sm text-text-secondary mt-0.5">
          {loading
            ? "در حال بارگذاری…"
            : filtering
              ? `${toPersianDigits(total)} نتیجه از این فیلتر`
              : `${toPersianDigits(total)} فاکتور صادر شده`}
        </p>

        {/*
          The lifecycle as chips instead of a <select>. Four states in the
          order a document moves through them, each with the colour it wears
          in the table — a filter that looks like what it filters.
        */}
        <div
          className="flex gap-2 mt-4 overflow-x-auto pb-1
                     sm:flex-wrap sm:overflow-x-visible sm:pb-0"
          role="group"
          aria-label="فیلتر وضعیت فاکتور"
        >
          <button
            onClick={() => setStatusFilter("")}
            aria-pressed={statusFilter === ""}
            className={`shrink-0 px-3 py-1.5 rounded-pill text-body-xs font-bold border
                        transition-colors cursor-pointer ${
                          statusFilter === ""
                            ? "bg-primary text-primary-fg border-primary"
                            : "bg-surface text-text-secondary border-border hover:border-border-strong"
                        }`}
          >
            همه
          </button>
          {REPAIR_INVOICE_STATUSES.map((status) => {
            const active = statusFilter === status.key;
            return (
              <button
                key={status.key}
                onClick={() => setStatusFilter(active ? "" : status.key)}
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
            placeholder="جستجو در شماره فاکتور، مشتری یا دستگاه…"
            aria-label="جستجوی فاکتور تعمیر"
            className={searchField}
          />
        </div>

        <div className={toolbarActions}>
          <button
            onClick={() => openRepairInvoiceCreate()}
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
            <WrenchScrewdriverIcon
              className="w-7 h-7 text-text-muted"
              aria-hidden="true"
            />
          </span>
          <p className="text-body-md font-bold text-text-primary">
            {filtering ? "نتیجه‌ای یافت نشد" : "هنوز فاکتور تعمیری ثبت نشده"}
          </p>
          <p className="text-body-sm text-text-secondary mt-1 max-w-sm">
            {filtering
              ? "این ترکیب فیلترها چیزی برنگرداند. یکی از آن‌ها را بردارید."
              : "اجرت تعمیر و قطعات مصرفی از اینجا فاکتور می‌شود."}
          </p>
          {filtering ? (
            <button
              onClick={() => {
                setSearchInput("");
                setStatusFilter("");
                setPage(1);
              }}
              className={`${secondaryButton} mt-5 flex-none`}
            >
              پاک‌کردن جستجو و فیلترها
            </button>
          ) : (
            <button
              onClick={() => openRepairInvoiceCreate()}
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
          {/*
            Below lg the table becomes one card per invoice. Ten columns need
            1040px, which on a phone is a page that has to be dragged sideways
            to read a single row.
          */}
          <motion.ul
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="lg:hidden space-y-3"
          >
            {invoices.map((invoice) => {
              const remaining = invoice.total_amount - invoice.paid_amount;
              const status = repairInvoiceStatusOf(invoice.status);
              return (
                <motion.li key={invoice.id} variants={staggerItem}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openRepairInvoiceDetail(invoice.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openRepairInvoiceDetail(invoice.id);
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
                          {invoice.device_name}
                          {invoice.brand ? ` (${invoice.brand})` : ""}
                        </p>
                        <p className="text-body-xs text-text-muted truncate">
                          {invoice.customer_name || "بدون مشتری"}
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
                      <RepairInvoiceStatusBadge status={invoice.status} />
                      <PaymentStatusBadge status={invoice.payment_status} />
                    </div>

                    {/*
                      The three money figures as a row of labelled columns.
                      On a phone they are the reason the card is open, and
                      «مانده» is the one a shop acts on — so it keeps the
                      danger tone the table gives it, and only when there is
                      something left to collect.
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

                    <div className="flex items-center justify-between gap-3 mt-3">
                      <span className="text-body-xs text-text-muted">
                        {formatPersianDate(invoice.invoice_date)}
                      </span>
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
                    <th className={th}>دستگاه</th>
                    <th className={th}>مشتری</th>
                    <th className={th}>تاریخ</th>
                    <th className={th}>مبلغ کل (ریال)</th>
                    <th className={th}>پرداخت شده (ریال)</th>
                    <th className={th}>مانده (ریال)</th>
                    <th className={th}>وضعیت</th>
                    <th className={th}>پرداخت</th>
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
                        onClick={() => openRepairInvoiceDetail(invoice.id)}
                        className={trClickable}
                      >
                        <td className={`${td} tabular-nums`}>
                          {invoice.invoice_number}
                        </td>
                        <td className={td}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openDeviceDetail(invoice.device_id);
                            }}
                            className="text-primary hover:underline font-medium"
                          >
                            {invoice.device_name}{" "}
                            {invoice.brand && `(${invoice.brand})`}
                          </button>
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
                            invoice.customer_name || "—"
                          )}
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
                        <td className="px-3 py-3 text-center">
                          <RepairInvoiceStatusBadge
                            status={invoice.status}
                            size="sm"
                          />
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
            onLimitChange={(l) => {
              setLimit(l);
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
            await deleteRepairInvoice(deleteTarget.id);
            toast.success("فاکتور حذف شد");
            setDeleteTarget(null);
            fetchInvoices(debouncedSearch, statusFilter, page, limit);
          } catch {
            toast.error("خطا");
          } finally {
            setDeleting(false);
          }
        }}
        title="حذف فاکتور تعمیر"
        message={`آیا از حذف "${deleteTarget?.invoice_number}" مطمئن هستید؟\nموجودی کالاها به حالت قبل برمی‌گردد.`}
        confirmText="حذف"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
