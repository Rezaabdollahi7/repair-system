import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import {
  BuildingStorefrontIcon,
  InformationCircleIcon,
  PlusIcon,
} from "@heroicons/react/24/solid";
/* Outline for the row's own controls — a solid heroicon at 20px is a disc. */
import {
  ArrowUturnLeftIcon,
  NoSymbolIcon,
  PencilSquareIcon,
  StarIcon,
} from "@heroicons/react/24/outline";
import { getWarehouses, setDefaultWarehouse, setWarehouseActive } from "../api";
import ConfirmModal from "../components/ConfirmModal";
import StatusPill from "../components/StatusPill";
import WarehouseFormModal from "../components/WarehouseFormModal";
import { errorText } from "../utils/errors";
import { formatPersianCurrency, toPersianDigits } from "../utils/formatters";
import { staggerContainer, staggerItem } from "../motion";
import {
  actionConfirm,
  actionDelete,
  actionEdit,
  actionNeutral,
  primaryButton,
  rowCard,
  tableCard,
  tableScroll,
  tbody,
  td,
  tdActions,
  tdBare,
  tdMuted,
  th,
  thead,
  tr,
} from "../utils/tableClasses";
import type { Warehouse } from "../types/api";

const iconSize = "w-[1.15rem] h-[1.15rem]";

/**
 * The warehouse's two flags as pills. «پیش‌فرض» takes the informational
 * tone — it is a role, not a verdict — and an inactive warehouse is muted
 * rather than red: retiring a warehouse is housekeeping, not a fault.
 */
function Flags({ warehouse }: { warehouse: Warehouse }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {warehouse.is_default && (
        <StatusPill
          label="پیش‌فرض"
          color="var(--info)"
          tone="bg-info-soft text-info-fg"
          size="sm"
        />
      )}
      {warehouse.is_active ? (
        <StatusPill
          label="فعال"
          color="var(--success)"
          tone="bg-success-soft text-success-fg"
          size="sm"
        />
      ) : (
        <StatusPill
          label="غیرفعال"
          color="var(--text-muted)"
          tone="bg-surface-alt text-text-muted"
          size="sm"
        />
      )}
    </span>
  );
}

function itemCount(count: number): string {
  return count === 0 ? "خالی" : `${toPersianDigits(count)} کالا`;
}

function stockValue(value: number): string {
  return value === 0 ? "—" : `${formatPersianCurrency(value)} ریال`;
}

/**
 * Warehouses (14.10): add, rename, choose the default, retire.
 *
 * A shop with one warehouse sees one row and an explanation of what a second
 * would be for — the pickers on the invoice forms stay hidden until there is
 * a second active one, so nothing changes for a shop that never comes here.
 */
export default function WarehouseList() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Warehouse | null>(null);
  const [defaultTarget, setDefaultTarget] = useState<Warehouse | null>(null);
  const [retireTarget, setRetireTarget] = useState<Warehouse | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchWarehouses = useCallback(async () => {
    try {
      const res = await getWarehouses();
      setWarehouses(res.data);
    } catch {
      toast.error("خطا در دریافت فهرست انبارها");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchWarehouses();
  }, [fetchWarehouses]);

  const openCreate = () => {
    setEditTarget(null);
    setFormOpen(true);
  };

  const openEdit = (warehouse: Warehouse) => {
    setEditTarget(warehouse);
    setFormOpen(true);
  };

  const askRetire = (warehouse: Warehouse) => {
    // The server refuses both of these and says why; saying it here first
    // spares a confirmation dialog that can only end in an error.
    if (warehouse.is_default) {
      toast.error(
        "انبار پیش‌فرض را نمی‌توان غیرفعال کرد. ابتدا انبار دیگری را پیش‌فرض کنید",
      );
      return;
    }
    if (warehouse.item_count > 0) {
      toast.error(
        `«${warehouse.name}» هنوز ${toPersianDigits(warehouse.item_count)} کالا با موجودی دارد. پیش از غیرفعال کردن، موجودی آن را صفر یا منتقل کنید`,
      );
      return;
    }
    setRetireTarget(warehouse);
  };

  const run = async (
    action: () => Promise<unknown>,
    success: string,
    failure: string,
  ) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      await fetchWarehouses();
      return true;
    } catch (error) {
      toast.error(errorText(error, failure));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const confirmDefault = async () => {
    if (!defaultTarget) return;
    const target = defaultTarget;
    await run(
      () => setDefaultWarehouse(target.id),
      `«${target.name}» انبار پیش‌فرض شد`,
      "خطا در تغییر انبار پیش‌فرض",
    );
    setDefaultTarget(null);
  };

  const confirmRetire = async () => {
    if (!retireTarget) return;
    const target = retireTarget;
    await run(
      () => setWarehouseActive(target.id, false),
      `«${target.name}» غیرفعال شد`,
      "خطا در غیرفعال کردن انبار",
    );
    setRetireTarget(null);
  };

  const reactivate = (warehouse: Warehouse) =>
    run(
      () => setWarehouseActive(warehouse.id, true),
      `«${warehouse.name}» دوباره فعال شد`,
      "خطا در فعال کردن انبار",
    );

  const rowActions = (warehouse: Warehouse) => (
    <div className="flex gap-1 justify-end items-center">
      <button
        onClick={() => openEdit(warehouse)}
        className={actionEdit}
        title="ویرایش"
        aria-label={`ویرایش ${warehouse.name}`}
      >
        <PencilSquareIcon className={iconSize} />
      </button>
      {warehouse.is_active && !warehouse.is_default && (
        <button
          onClick={() => setDefaultTarget(warehouse)}
          className={actionNeutral}
          title="پیش‌فرض کردن"
          aria-label={`پیش‌فرض کردن ${warehouse.name}`}
          disabled={busy}
        >
          <StarIcon className={iconSize} />
        </button>
      )}
      {warehouse.is_active ? (
        !warehouse.is_default && (
          <button
            onClick={() => askRetire(warehouse)}
            className={actionDelete}
            title="غیرفعال کردن"
            aria-label={`غیرفعال کردن ${warehouse.name}`}
            disabled={busy}
          >
            <NoSymbolIcon className={iconSize} />
          </button>
        )
      ) : (
        <button
          onClick={() => void reactivate(warehouse)}
          className={actionConfirm}
          title="فعال کردن دوباره"
          aria-label={`فعال کردن ${warehouse.name}`}
          disabled={busy}
        >
          <ArrowUturnLeftIcon className={iconSize} />
        </button>
      )}
    </div>
  );

  const activeCount = warehouses.filter((w) => w.is_active).length;

  const skeleton = (
    <div className="animate-pulse">
      <div className="hidden lg:block bg-surface border border-border rounded-panel p-5">
        <div className="h-4 w-full rounded-field bg-surface-alt mb-5" />
        {Array.from({ length: 3 }, (_, row) => (
          <div key={row} className="flex gap-3 mb-4">
            {[3, 2, 2, 2, 3, 2].map((span, cell) => (
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
        {[0, 1].map((card) => (
          <div
            key={card}
            className="h-28 rounded-panel border border-border bg-surface"
          />
        ))}
      </div>
    </div>
  );

  return (
    <div dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <p className="flex-1 min-w-0 text-body-sm text-text-secondary leading-7">
          هر سندی که انباری برایش انتخاب نشود در انبار پیش‌فرض ثبت می‌شود.
          انباری که دیگر استفاده نمی‌شود حذف نمی‌شود، غیرفعال می‌شود — و فقط
          وقتی خالی باشد.
        </p>
        <button onClick={openCreate} className={primaryButton}>
          <PlusIcon className={iconSize} aria-hidden="true" />
          انبار جدید
        </button>
      </div>

      {/*
        Only while there is one: the explanation of what a second warehouse is
        for, so a shop that opens this page out of curiosity leaves knowing
        whether it needs one. Once a second exists the page explains itself.
      */}
      {!loading && activeCount === 1 && (
        <div className="flex items-start gap-3 bg-info-soft border border-info/25 rounded-panel p-4 mb-4">
          <span className="shrink-0 w-9 h-9 rounded-field bg-info/15 flex items-center justify-center">
            <InformationCircleIcon
              className="w-5 h-5 text-info-fg"
              aria-hidden="true"
            />
          </span>
          <p className="text-body-sm text-info-fg leading-7">
            کارگاه شما یک انبار دارد و همه‌چیز در آن ثبت می‌شود. اگر کالا را در
            دو جا نگه می‌دارید — مثلاً مغازه و قفسه‌ی تعمیرات، یا دو شعبه —
            انبار دوم را اضافه کنید تا موجودی هر کدام جدا دیده شود. تا وقتی یک
            انبار دارید، انتخاب انبار در فرم فاکتورها نمایش داده نمی‌شود.
          </p>
        </div>
      )}

      {loading ? (
        skeleton
      ) : warehouses.length === 0 ? (
        <div className="bg-surface border border-border rounded-panel flex flex-col items-center justify-center text-center py-16 px-4">
          <span className="w-14 h-14 rounded-panel bg-surface-alt flex items-center justify-center mb-4">
            <BuildingStorefrontIcon
              className="w-7 h-7 text-text-muted"
              aria-hidden="true"
            />
          </span>
          <p className="text-body-md font-bold text-text-primary">
            انباری پیدا نشد
          </p>
        </div>
      ) : (
        <>
          {/* Below lg the table becomes one card per warehouse. */}
          <motion.ul
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="lg:hidden space-y-3"
          >
            {warehouses.map((warehouse) => (
              <motion.li key={warehouse.id} variants={staggerItem}>
                <div
                  className={`${rowCard} ${warehouse.is_active ? "" : "opacity-70"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body-md font-bold text-text-primary truncate">
                        {warehouse.name}
                      </p>
                      {warehouse.note && (
                        <p className="text-body-xs text-text-muted mt-0.5 line-clamp-2">
                          {warehouse.note}
                        </p>
                      )}
                    </div>
                    <Flags warehouse={warehouse} />
                  </div>

                  <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-border-subtle">
                    <span className="text-body-xs text-text-muted tabular-nums">
                      {itemCount(warehouse.item_count)}
                      {warehouse.stock_value > 0 &&
                        ` — ${stockValue(warehouse.stock_value)}`}
                    </span>
                    {rowActions(warehouse)}
                  </div>
                </div>
              </motion.li>
            ))}
          </motion.ul>

          <div className={`hidden lg:block ${tableCard}`}>
            <div className={tableScroll}>
              <table className="min-w-[820px] w-full">
                <thead className={thead}>
                  <tr>
                    <th className={th}>نام انبار</th>
                    <th className={th}>وضعیت</th>
                    <th className={th}>کالاهای موجود</th>
                    <th className={th}>ارزش موجودی</th>
                    <th className={th}>توضیح</th>
                    <th className={th}>عملیات</th>
                  </tr>
                </thead>
                <tbody className={tbody}>
                  {warehouses.map((warehouse) => (
                    <tr
                      key={warehouse.id}
                      className={`${tr} ${warehouse.is_active ? "" : "opacity-70"}`}
                    >
                      <td className={`${td} font-bold`}>{warehouse.name}</td>
                      <td className={tdBare}>
                        <Flags warehouse={warehouse} />
                      </td>
                      <td className={`${tdMuted} tabular-nums`}>
                        {itemCount(warehouse.item_count)}
                      </td>
                      <td className={`${td} tabular-nums`}>
                        {stockValue(warehouse.stock_value)}
                      </td>
                      <td className={`${tdMuted} max-w-[18rem] truncate`}>
                        {warehouse.note ?? "—"}
                      </td>
                      <td className={tdActions}>{rowActions(warehouse)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {formOpen && (
        <WarehouseFormModal
          key={editTarget?.id ?? "new"}
          warehouse={editTarget}
          onClose={() => setFormOpen(false)}
          onSuccess={() => void fetchWarehouses()}
        />
      )}

      <ConfirmModal
        isOpen={!!defaultTarget}
        onClose={() => setDefaultTarget(null)}
        onConfirm={confirmDefault}
        title="تغییر انبار پیش‌فرض"
        message={`از این پس هر سندی که انباری برایش انتخاب نشود در «${defaultTarget?.name ?? ""}» ثبت می‌شود. موجودی فعلی انبارها جابه‌جا نمی‌شود.`}
        confirmText="پیش‌فرض شود"
        variant="info"
        loading={busy}
      />

      <ConfirmModal
        isOpen={!!retireTarget}
        onClose={() => setRetireTarget(null)}
        onConfirm={confirmRetire}
        title="غیرفعال کردن انبار"
        message={`«${retireTarget?.name ?? ""}» دیگر در فرم‌ها پیشنهاد نمی‌شود و کالایی به آن وارد نمی‌شود. سابقه‌ی اسنادش می‌ماند و هر وقت خواستید می‌توانید دوباره فعالش کنید.`}
        confirmText="غیرفعال شود"
        variant="warning"
        loading={busy}
      />
    </div>
  );
}
