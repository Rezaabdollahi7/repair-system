import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
  ScaleIcon,
} from "@heroicons/react/24/outline";
import { getItemPrices } from "../api";
import { useModal } from "../context/ModalContext";
import { errorText } from "../utils/errors";
import {
  formatPersianCurrency,
  formatPersianDate,
  formatQuantity,
  toPersianDigits,
} from "../utils/formatters";
import {
  tableCard,
  tableScroll,
  tbody,
  td,
  tdMuted,
  th,
  thead,
  trClickable,
} from "../utils/tableClasses";
import type {
  ItemPricePoint,
  ItemPrices as ItemPricesData,
} from "../types/api";

interface ItemPricesProps {
  itemId: number;
  unit: string;
  /** Changes when the item's stock does, so a quick purchase reloads it. */
  version: number;
}

function PriceTile({
  icon: Icon,
  label,
  point,
  value,
  detail,
  onOpen,
}: {
  icon: typeof ClockIcon;
  label: string;
  point?: ItemPricePoint | null;
  value?: number | null;
  detail?: string;
  onOpen?: (point: ItemPricePoint) => void;
}) {
  const amount = point ? point.price : value;
  return (
    <div className="bg-surface border border-border rounded-field p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-2 text-text-secondary">
        <Icon className="w-4 h-4 shrink-0" />
        <span className="text-body-xs sm:text-body-sm">{label}</span>
      </div>
      <p className="text-body-md sm:text-title-sm font-bold text-text-primary tabular-nums">
        {amount !== null && amount !== undefined
          ? `${formatPersianCurrency(amount)} ریال`
          : "—"}
      </p>
      {point ? (
        <button
          onClick={() => onOpen?.(point)}
          className="mt-1 text-body-xs text-primary hover:underline cursor-pointer text-right"
        >
          {point.invoice_number} · {formatPersianDate(point.invoice_date)}
          {point.supplier ? ` · ${point.supplier}` : ""}
        </button>
      ) : (
        detail && <p className="mt-1 text-body-xs text-text-muted">{detail}</p>
      )}
    </div>
  );
}

/**
 * What the shop has paid for an item (14.20): the last, lowest and highest
 * purchase price — each a link to the invoice it came from — the average
 * over every unit bought, and beside them what the stock on the shelf
 * costs now and what it sells for.
 */
export default function ItemPrices({ itemId, unit, version }: ItemPricesProps) {
  const { openPurchaseInvoiceDetail, openSaleInvoiceDetail } = useModal();
  const [data, setData] = useState<ItemPricesData | null>(null);

  useEffect(() => {
    let cancelled = false;
    getItemPrices(itemId)
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((error) => {
        if (!cancelled) toast.error(errorText(error, "خطا در دریافت قیمت‌ها"));
      });
    return () => {
      cancelled = true;
    };
  }, [itemId, version]);

  if (data === null) {
    return <div className="animate-pulse h-64 rounded-panel bg-surface" />;
  }

  const openPurchase = (point: ItemPricePoint) =>
    openPurchaseInvoiceDetail(point.invoice_id);
  const { purchase, sale } = data;

  // Gross margin on the current sell price, against what the shelf cost.
  const margin =
    data.sell_price > 0 && data.current_average > 0
      ? data.sell_price - data.current_average
      : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      {purchase.lines === 0 ? (
        <p className="text-body-sm text-text-muted text-center bg-surface border border-border rounded-panel py-8">
          این کالا هنوز با فاکتور خرید وارد نشده است؛ آمار قیمت خرید پس از اولین
          خرید ساخته می‌شود.
        </p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <PriceTile
            icon={ClockIcon}
            label="آخرین قیمت خرید"
            point={purchase.last}
            onOpen={openPurchase}
          />
          <PriceTile
            icon={ArrowTrendingDownIcon}
            label="کمترین قیمت خرید"
            point={purchase.lowest}
            onOpen={openPurchase}
          />
          <PriceTile
            icon={ArrowTrendingUpIcon}
            label="بیشترین قیمت خرید"
            point={purchase.highest}
            onOpen={openPurchase}
          />
          <PriceTile
            icon={ScaleIcon}
            label="میانگین قیمت خرید"
            value={purchase.average}
            detail={`${toPersianDigits(purchase.lines)} فاکتور · ${formatQuantity(purchase.quantity)} ${unit}`}
          />
        </div>
      )}

      <section className="bg-surface border border-border rounded-panel shadow-sm p-4 sm:p-6">
        <h3 className="text-base font-bold text-text-primary mb-3">
          بها و قیمت فروش
        </h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-body-sm">
          <div>
            <dt className="text-text-secondary">بهای موجودی فعلی</dt>
            <dd className="font-bold text-text-primary tabular-nums mt-1">
              {formatPersianCurrency(data.current_average)} ریال
            </dd>
            <dd className="text-body-xs text-text-muted mt-0.5">
              میانگین متحرکِ آنچه در انبار مانده
            </dd>
          </div>
          <div>
            <dt className="text-text-secondary">قیمت فروش</dt>
            <dd className="font-bold text-text-primary tabular-nums mt-1">
              {data.sell_price
                ? `${formatPersianCurrency(data.sell_price)} ریال`
                : "تعیین نشده"}
            </dd>
          </div>
          <div>
            <dt className="text-text-secondary">سود هر واحد با قیمت فعلی</dt>
            <dd
              className={`font-bold tabular-nums mt-1 ${
                margin === null
                  ? "text-text-muted"
                  : margin >= 0
                    ? "text-success-fg"
                    : "text-danger-fg"
              }`}
            >
              {margin === null
                ? "—"
                : `${formatPersianCurrency(Math.abs(margin))} ریال${margin < 0 ? " زیان" : ""}`}
            </dd>
            {margin !== null && (
              <dd className="text-body-xs text-text-muted mt-0.5 tabular-nums">
                ٪{toPersianDigits(Math.round((margin / data.sell_price) * 100))}{" "}
                از قیمت فروش
              </dd>
            )}
          </div>
          <div>
            <dt className="text-text-secondary">میانگین قیمت فروش</dt>
            <dd className="font-bold text-text-primary tabular-nums mt-1">
              {sale.average !== null
                ? `${formatPersianCurrency(sale.average)} ریال`
                : "—"}
            </dd>
            {sale.last && (
              <dd className="mt-0.5">
                <button
                  onClick={() => openSaleInvoiceDetail(sale.last!.invoice_id)}
                  className="text-body-xs text-primary hover:underline cursor-pointer"
                >
                  آخرین: {formatPersianCurrency(sale.last.price)} ·{" "}
                  {sale.last.invoice_number}
                </button>
              </dd>
            )}
          </div>
        </dl>
      </section>

      {data.history.length > 0 && (
        <section>
          <h3 className="text-base font-bold text-text-primary mb-3">
            سابقه‌ی خرید
          </h3>
          <div className={tableCard}>
            <div className={tableScroll}>
              <table className="w-full min-w-[40rem]">
                <thead className={thead}>
                  <tr>
                    <th className={th}>تاریخ</th>
                    <th className={th}>فاکتور</th>
                    <th className={th}>تأمین‌کننده</th>
                    <th className={th}>مقدار</th>
                    <th className={th}>قیمت واحد (ریال)</th>
                  </tr>
                </thead>
                <tbody className={tbody}>
                  {data.history.map((point, index) => (
                    <tr
                      key={`${point.invoice_id}-${index}`}
                      onClick={() => openPurchase(point)}
                      className={trClickable}
                    >
                      <td className={`${tdMuted} tabular-nums`}>
                        {formatPersianDate(point.invoice_date)}
                      </td>
                      <td className={`${td} font-bold tabular-nums`}>
                        {point.invoice_number}
                      </td>
                      <td className={tdMuted}>{point.supplier || "—"}</td>
                      <td className={`${td} tabular-nums`}>
                        {formatQuantity(point.quantity)} {unit}
                      </td>
                      <td className={`${td} tabular-nums font-bold`}>
                        {formatPersianCurrency(point.price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
