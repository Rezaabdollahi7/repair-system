import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import {
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  BanknotesIcon,
  BuildingStorefrontIcon,
  ClipboardDocumentListIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
  ScaleIcon,
  ShoppingCartIcon,
  TagIcon,
  TrashIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { deleteItem, getItem, getItemTrade, getItemTransactions } from "../api";
import { useModal } from "../context/ModalContext";
import { usePageCrumb } from "../context/BreadcrumbContext";
import ConfirmModal from "../components/ConfirmModal";
import InfoRow from "../components/InfoRow";
import StatusPill from "../components/StatusPill";
import Tabs, { TabPanel, type TabItem } from "../components/Tabs";
import {
  QuickPurchaseModal,
  QuickSaleModal,
} from "../components/ItemQuickModals";
import { errorText } from "../utils/errors";
import {
  formatPersianCurrency,
  formatPersianDate,
  formatQuantity,
  toPersianDigits,
} from "../utils/formatters";
import { movementTypeOf } from "../utils/movementType";
import { stockStatusOf } from "../utils/stockStatus";
import { paymentStatusOf, repairInvoiceStatusOf } from "../utils/invoiceStatus";
import { useTabParam } from "../utils/tabs";
import { useWarehouses } from "../utils/warehouses";
import { staggerContainer, staggerItem } from "../motion";
import {
  primaryButton,
  secondaryButton,
  tableCard,
  tableScroll,
  tbody,
  td,
  tdBare,
  tdMuted,
  th,
  thead,
  tr,
  trClickable,
} from "../utils/tableClasses";
import type {
  InventoryTransaction,
  Item,
  ItemTrade,
  ItemTradeRow,
} from "../types/api";

/*
 * The tabs this page has today. «قیمت‌ها» (14.20) and «تغییرات» (14.29)
 * join the list when the figures behind them exist — a tab that only says
 * «به‌زودی» is a promise in the middle of a working screen.
 */
const TAB_IDS = ["overview", "kardex", "trade"] as const;
type TabId = (typeof TAB_IDS)[number];

const TABS: TabItem<TabId>[] = [
  { id: "overview", label: "نمای کلی", icon: CubeIcon },
  { id: "kardex", label: "کاردکس", icon: ClipboardDocumentListIcon },
  { id: "trade", label: "خرید و فروش", icon: ShoppingCartIcon },
];

/* ── Pieces ────────────────────────────────────────────────────────── */

function Card({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: typeof CubeIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface border border-border rounded-panel shadow-sm p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-base sm:text-lg font-bold text-text-primary flex items-center gap-2">
          <Icon className="w-5 h-5 text-text-secondary" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof CubeIcon;
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-border rounded-field p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-2 text-text-secondary">
        <Icon className="w-4 h-4 shrink-0" />
        <span className="text-body-xs sm:text-body-sm truncate">{label}</span>
      </div>
      <p className="text-body-md sm:text-title-sm font-bold text-text-primary tabular-nums">
        {value}
      </p>
      {detail && (
        <p className="text-body-xs text-text-muted tabular-nums mt-0.5">
          {detail}
        </p>
      )}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-body-sm text-text-muted text-center py-10">{children}</p>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4 sm:space-y-6">
      <div className="bg-surface border border-border rounded-panel p-6">
        <div className="h-6 w-48 rounded-field bg-surface-alt mb-3" />
        <div className="h-4 w-64 rounded-field bg-surface-alt" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-24 rounded-field bg-surface border border-border"
          />
        ))}
      </div>
      <div className="h-64 rounded-panel bg-surface border border-border" />
    </div>
  );
}

/* ── نمای کلی ──────────────────────────────────────────────────────── */

function Overview({
  item,
  showWarehouses,
  onQuickPurchase,
  onQuickSale,
}: {
  item: Item;
  showWarehouses: boolean;
  onQuickPurchase: () => void;
  onQuickSale: () => void;
}) {
  const status = stockStatusOf(item.currentStock, item.minStock);
  const stocks = item.stocks ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
      <div className="space-y-4 sm:space-y-6">
        <section className={`border rounded-panel p-5 ${status.tone}`}>
          <p className="text-body-sm font-bold flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: status.color }}
              aria-hidden="true"
            />
            {status.label}
          </p>
          <p className="text-3xl font-bold text-text-primary tabular-nums mt-1">
            {formatQuantity(item.currentStock)}{" "}
            <span className="text-lg font-normal text-text-secondary">
              {item.unit}
            </span>
          </p>
          <p className="text-body-sm text-text-secondary mt-2 tabular-nums">
            حداقل موجودی: {formatQuantity(item.minStock)} {item.unit}
          </p>
          {status.key !== "ok" && (
            <p className="mt-3 text-body-sm flex items-start gap-2">
              <ExclamationTriangleIcon
                className="w-4 h-4 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              {status.key === "out"
                ? "موجودی این کالا تمام شده است."
                : "موجودی به زیر حداقل رسیده؛ وقت سفارش است."}
            </p>
          )}
        </section>

        <Card title="عملیات سریع" icon={ArrowTrendingUpIcon}>
          <div className="space-y-3">
            <button
              onClick={onQuickPurchase}
              className={`${primaryButton} w-full`}
            >
              <ArrowTrendingUpIcon className="w-4 h-4" />
              افزایش موجودی (خرید سریع)
            </button>
            <button
              onClick={onQuickSale}
              className={`${secondaryButton} w-full justify-center`}
            >
              <ArrowTrendingDownIcon className="w-4 h-4" />
              کاهش موجودی (فروش سریع)
            </button>
          </div>
        </Card>
      </div>

      <div className="lg:col-span-2 space-y-4 sm:space-y-6">
        <Card title="اطلاعات کالا" icon={TagIcon}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <div className="space-y-1">
              <InfoRow label="کد کالا" value={item.code} highlight />
              <InfoRow label="دسته‌بندی" value={item.categoryName ?? "—"} />
              <InfoRow
                label="واحد شمارش"
                value={`${item.unit}${item.isFractional ? " (کسری)" : ""}`}
              />
              <InfoRow
                label="حداقل موجودی"
                value={`${formatQuantity(item.minStock)} ${item.unit}`}
              />
            </div>
            <div className="space-y-1">
              <InfoRow
                label="قیمت فروش"
                value={
                  item.sellPrice
                    ? `${formatPersianCurrency(item.sellPrice)} ریال`
                    : "—"
                }
              />
              <InfoRow
                label="میانگین بهای خرید"
                value={
                  item.avgPurchasePrice
                    ? `${formatPersianCurrency(item.avgPurchasePrice)} ریال`
                    : "—"
                }
              />
              <InfoRow
                label="تاریخ ثبت"
                value={formatPersianDate(item.createdAt)}
              />
              <InfoRow
                label="وضعیت"
                value={item.isActive ? "فعال" : "غیرفعال"}
              />
            </div>
          </div>
          {item.description && (
            <p className="mt-4 text-body-sm text-text-secondary bg-surface-alt rounded-field p-3 leading-7">
              {item.description}
            </p>
          )}
        </Card>

        {/* Only for a shop that has met warehouses: one row would repeat
            the figure on the card beside it. */}
        {showWarehouses && stocks.length > 0 && (
          <Card title="موجودی در انبارها" icon={BuildingStorefrontIcon}>
            <div className={tableCard}>
              <div className={tableScroll}>
                <table className="w-full min-w-[28rem]">
                  <thead className={thead}>
                    <tr>
                      <th className={th}>انبار</th>
                      <th className={th}>قفسه</th>
                      <th className={th}>موجودی</th>
                    </tr>
                  </thead>
                  <tbody className={tbody}>
                    {stocks.map((stock) => (
                      <tr key={stock.warehouseId} className={tr}>
                        <td className={td}>
                          {stock.warehouseName}
                          {!stock.warehouseActive && (
                            <span className="text-body-xs text-text-muted ms-2">
                              (غیرفعال)
                            </span>
                          )}
                        </td>
                        <td className={tdMuted}>{stock.location ?? "—"}</td>
                        <td className={`${td} font-bold tabular-nums`}>
                          {formatQuantity(stock.quantity)} {item.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ── کاردکس ────────────────────────────────────────────────────────── */

/**
 * The item's movements, newest first. In and out are two columns rather
 * than one signed figure: a «−» beside Persian digits lands on the wrong
 * side of them, and a column of one colour reads faster than a sign.
 * The full kardex — balance, filters, a link to every document — is 14.19.
 */
function Kardex({
  item,
  warehouseNames,
}: {
  item: Item;
  warehouseNames: Map<number, string> | null;
}) {
  const { openPurchaseInvoiceDetail } = useModal();
  const [rows, setRows] = useState<InventoryTransaction[] | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getItemTransactions(item.id, { limit: 100 })
      .then((res) => {
        if (cancelled) return;
        setRows(res.data.data);
        setTotal(res.data.total);
      })
      .catch((error) => {
        if (!cancelled) toast.error(errorText(error, "خطا در دریافت کاردکس"));
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.currentStock]);

  if (rows === null) {
    return <div className="animate-pulse h-64 rounded-panel bg-surface" />;
  }
  if (rows.length === 0) {
    return <EmptyNote>هنوز حرکتی برای این کالا ثبت نشده است.</EmptyNote>;
  }

  return (
    <div className="space-y-3">
      <div className={tableCard}>
        <div className={tableScroll}>
          <table className="w-full min-w-[46rem]">
            <thead className={thead}>
              <tr>
                <th className={th}>تاریخ</th>
                <th className={th}>نوع</th>
                {warehouseNames && <th className={th}>انبار</th>}
                <th className={th}>ورود</th>
                <th className={th}>خروج</th>
                <th className={th}>بهای واحد (ریال)</th>
                <th className={th}>شرح</th>
              </tr>
            </thead>
            <tbody className={tbody}>
              {rows.map((row) => {
                const type = movementTypeOf(row.type);
                const invoiceId = row.reference_id;
                return (
                  <tr key={row.id} className={tr}>
                    <td className={`${tdMuted} tabular-nums`}>
                      {formatPersianDate(row.occurred_at)}
                    </td>
                    <td className={tdBare}>
                      <StatusPill
                        label={type.label}
                        color={type.color}
                        tone={type.tone}
                        size="sm"
                      />
                    </td>
                    {warehouseNames && (
                      <td className={tdMuted}>
                        {warehouseNames.get(row.warehouse_id) ?? "—"}
                      </td>
                    )}
                    <td className={`${td} tabular-nums text-success-fg`}>
                      {row.quantity > 0 ? formatQuantity(row.quantity) : ""}
                    </td>
                    <td className={`${td} tabular-nums text-danger-fg`}>
                      {row.quantity < 0
                        ? formatQuantity(Math.abs(row.quantity))
                        : ""}
                    </td>
                    <td className={`${tdMuted} tabular-nums`}>
                      {row.unit_cost !== null
                        ? formatPersianCurrency(row.unit_cost)
                        : "—"}
                    </td>
                    <td className={tdMuted}>
                      {row.purchase_invoice_number && invoiceId !== null ? (
                        <button
                          onClick={() => openPurchaseInvoiceDetail(invoiceId)}
                          className="text-primary font-bold hover:underline cursor-pointer"
                        >
                          {row.purchase_invoice_number}
                        </button>
                      ) : (
                        (row.note ?? "—")
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {total > rows.length && (
        <p className="text-body-xs text-text-muted">
          {toPersianDigits(rows.length)} حرکت آخر از {toPersianDigits(total)}{" "}
          حرکت نشان داده شده است.
        </p>
      )}
    </div>
  );
}

/* ── خرید و فروش ───────────────────────────────────────────────────── */

const KIND_LABELS: Record<ItemTradeRow["kind"], string> = {
  purchase: "خرید",
  sale: "فروش",
  repair: "تعمیر",
};

function Trade({ item }: { item: Item }) {
  const {
    openPurchaseInvoiceDetail,
    openSaleInvoiceDetail,
    openRepairInvoiceDetail,
  } = useModal();
  const [trade, setTrade] = useState<ItemTrade | null>(null);

  useEffect(() => {
    let cancelled = false;
    getItemTrade(item.id)
      .then((res) => {
        if (!cancelled) setTrade(res.data);
      })
      .catch((error) => {
        if (!cancelled)
          toast.error(errorText(error, "خطا در دریافت خرید و فروش"));
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.currentStock]);

  if (trade === null) {
    return <div className="animate-pulse h-64 rounded-panel bg-surface" />;
  }

  const open = (row: ItemTradeRow) => {
    if (row.kind === "purchase") openPurchaseInvoiceDetail(row.invoice_id);
    else if (row.kind === "sale") openSaleInvoiceDetail(row.invoice_id);
    else openRepairInvoiceDetail(row.invoice_id);
  };

  const { totals } = trade;
  const quantity = (value: number) => `${formatQuantity(value)} ${item.unit}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat
          icon={ShoppingCartIcon}
          label="خریده‌شده"
          value={quantity(totals.purchase.quantity)}
          detail={`${toPersianDigits(totals.purchase.lines)} فاکتور · ${formatPersianCurrency(totals.purchase.amount)} ریال`}
        />
        <Stat
          icon={BanknotesIcon}
          label="فروخته‌شده"
          value={quantity(totals.sale.quantity)}
          detail={`${toPersianDigits(totals.sale.lines)} فاکتور · ${formatPersianCurrency(totals.sale.amount)} ریال`}
        />
        <Stat
          icon={WrenchScrewdriverIcon}
          label="مصرف در تعمیر"
          value={quantity(totals.repair.quantity)}
          detail={`${toPersianDigits(totals.repair.lines)} فاکتور صادرشده · ${formatPersianCurrency(totals.repair.amount)} ریال`}
        />
      </div>

      {trade.rows.length === 0 ? (
        <EmptyNote>این کالا هنوز در هیچ فاکتوری نیامده است.</EmptyNote>
      ) : (
        <div className={tableCard}>
          <div className={tableScroll}>
            <table className="w-full min-w-[52rem]">
              <thead className={thead}>
                <tr>
                  <th className={th}>نوع</th>
                  <th className={th}>شماره فاکتور</th>
                  <th className={th}>تاریخ</th>
                  <th className={th}>طرف حساب</th>
                  <th className={th}>مقدار</th>
                  <th className={th}>قیمت واحد (ریال)</th>
                  <th className={th}>جمع (ریال)</th>
                  <th className={th}>وضعیت</th>
                </tr>
              </thead>
              <tbody className={tbody}>
                {trade.rows.map((row) => {
                  const status =
                    row.kind === "repair"
                      ? repairInvoiceStatusOf(row.status)
                      : paymentStatusOf(row.status);
                  return (
                    <tr
                      key={`${row.kind}-${row.line_id}`}
                      onClick={() => open(row)}
                      className={trClickable}
                    >
                      <td className={td}>{KIND_LABELS[row.kind]}</td>
                      <td className={`${td} font-bold tabular-nums`}>
                        {row.invoice_number}
                      </td>
                      <td className={`${tdMuted} tabular-nums`}>
                        {formatPersianDate(row.invoice_date)}
                      </td>
                      <td className={tdMuted}>{row.party || "—"}</td>
                      <td className={`${td} tabular-nums`}>
                        {quantity(row.quantity)}
                      </td>
                      <td className={`${tdMuted} tabular-nums`}>
                        {formatPersianCurrency(row.unit_price)}
                      </td>
                      <td className={`${td} tabular-nums`}>
                        {formatPersianCurrency(row.total_price)}
                      </td>
                      <td className={tdBare}>
                        <StatusPill
                          label={status.label}
                          color={status.color}
                          tone={status.tone}
                          size="sm"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {trade.truncated && (
        <p className="text-body-xs text-text-muted">
          صد ردیف آخر نشان داده شده است؛ جمع‌های بالا همه‌ی فاکتورها را
          می‌شمارند.
        </p>
      )}
    </div>
  );
}

/* ── The page ──────────────────────────────────────────────────────── */

/**
 * An item's own screen (14.18), replacing the item modal: reached from the
 * item list, the stock and profit reports, the ledger and every invoice,
 * and read for a while — a kardex is not glanced at. «Back» goes to the
 * item list, through the crumb.
 */
export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const itemId = Number(id);
  const navigate = useNavigate();
  const { openItemEdit, refreshList } = useModal();
  const [tab, setTab] = useTabParam(TAB_IDS, "overview");
  const warehouses = useWarehouses();

  const validId = Number.isInteger(itemId) && itemId > 0;
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(validId);
  const [failed, setFailed] = useState(false);
  const [quick, setQuick] = useState<"purchase" | "sale" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Never raises `loading`: a reload after a modal closes refreshes the
  // page in place, as on the customer page.
  const load = useCallback(async () => {
    if (!validId) return;
    try {
      const res = await getItem(itemId);
      setItem(res.data);
      setFailed(false);
    } catch (error) {
      setFailed(true);
      // One toast however many times the load runs (StrictMode runs it
      // twice in development, and a modal closing runs it again).
      toast.error(errorText(error, "خطا در دریافت اطلاعات کالا"), {
        id: `item-${itemId}-load`,
      });
    } finally {
      setLoading(false);
    }
  }, [itemId, validId]);

  useEffect(() => {
    void load();
  }, [load]);

  // The edit modal and the invoice modals opened from the tabs can change
  // what this page shows; closing one reloads it.
  useEffect(() => {
    refreshList(load);
    return () => refreshList(null);
  }, [refreshList, load]);

  usePageCrumb({
    name: item?.name ?? "کالا",
    parent: { name: "انبار و کالاها", path: "/items" },
  });

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteItem(itemId);
      toast.success("کالا حذف شد");
      navigate("/items");
    } catch (error) {
      // The server refuses an item that has ever moved, and says so.
      toast.error(errorText(error, "خطا در حذف کالا"));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <Skeleton />;

  if (!validId || failed || !item) {
    return (
      <div className="bg-surface border border-border rounded-panel p-10 text-center">
        <p className="text-body-md text-text-secondary mb-4">
          این کالا پیدا نشد.
        </p>
        <button onClick={() => navigate("/items")} className={secondaryButton}>
          بازگشت به فهرست کالاها
        </button>
      </div>
    );
  }

  const status = stockStatusOf(item.currentStock, item.minStock);
  const showWarehouses =
    warehouses.showPicker || (item.stocks?.length ?? 0) > 1;
  const warehouseNames = showWarehouses
    ? new Map(warehouses.warehouses.map((w) => [w.id, w.name]))
    : null;

  return (
    <motion.div
      dir="rtl"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-4 sm:space-y-6"
    >
      <motion.header
        variants={staggerItem}
        className="bg-surface border border-border rounded-panel shadow-sm p-4 sm:p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="w-12 h-12 shrink-0 rounded-field bg-primary-soft text-primary flex items-center justify-center">
              <CubeIcon className="w-7 h-7" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-title-sm sm:text-title-md font-bold text-text-primary truncate">
                  {item.name}
                </h2>
                <StatusPill
                  label={status.label}
                  color={status.color}
                  tone={status.tone}
                  size="sm"
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-body-sm text-text-secondary">
                <span dir="ltr">{item.code}</span>
                {item.categoryName && <span>{item.categoryName}</span>}
              </div>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => openItemEdit(item.id)}
              className={secondaryButton}
            >
              <PencilSquareIcon className="w-4 h-4" />
              ویرایش
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className={`${secondaryButton} text-danger-fg`}
              aria-label={`حذف ${item.name}`}
            >
              <TrashIcon className="w-4 h-4" />
              حذف
            </button>
          </div>
        </div>
      </motion.header>

      <motion.div
        variants={staggerItem}
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        <Stat
          icon={CubeIcon}
          label="موجودی"
          value={`${formatQuantity(item.currentStock)} ${item.unit}`}
        />
        <Stat
          icon={ScaleIcon}
          label="میانگین بها (ریال)"
          value={formatPersianCurrency(item.avgPurchasePrice)}
        />
        <Stat
          icon={TagIcon}
          label="قیمت فروش (ریال)"
          value={item.sellPrice ? formatPersianCurrency(item.sellPrice) : "—"}
        />
        <Stat
          icon={BanknotesIcon}
          label="ارزش موجودی (ریال)"
          value={formatPersianCurrency(
            Math.round(item.currentStock * item.avgPurchasePrice),
          )}
        />
      </motion.div>

      <motion.div variants={staggerItem}>
        <Tabs
          tabs={TABS}
          value={tab}
          onChange={setTab}
          ariaLabel="بخش‌های صفحه‌ی کالا"
          idPrefix="item"
          className="mb-4 sm:mb-6"
        />

        <TabPanel idPrefix="item" id="overview" active={tab === "overview"}>
          <Overview
            item={item}
            showWarehouses={showWarehouses}
            onQuickPurchase={() => setQuick("purchase")}
            onQuickSale={() => setQuick("sale")}
          />
        </TabPanel>
        <TabPanel idPrefix="item" id="kardex" active={tab === "kardex"}>
          <Kardex item={item} warehouseNames={warehouseNames} />
        </TabPanel>
        <TabPanel idPrefix="item" id="trade" active={tab === "trade"}>
          <Trade item={item} />
        </TabPanel>
      </motion.div>

      <QuickPurchaseModal
        isOpen={quick === "purchase"}
        onClose={() => setQuick(null)}
        onSuccess={() => void load()}
        item={item}
      />
      <QuickSaleModal
        isOpen={quick === "sale"}
        onClose={() => setQuick(null)}
        onSuccess={() => void load()}
        item={item}
      />
      <ConfirmModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="حذف کالا"
        message={`کالای «${item.name}» حذف شود؟ کالایی که در فاکتور یا سند انباری آمده باشد حذف نمی‌شود.`}
        confirmText="حذف"
        variant="danger"
        loading={deleting}
      />
    </motion.div>
  );
}
