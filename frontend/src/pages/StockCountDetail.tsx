import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  PrinterIcon,
} from "@heroicons/react/24/solid";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import {
  addStockCountLine,
  cancelStockCount,
  getItems,
  getStockCount,
  updateStockCountLine,
} from "../api";
import { usePageCrumb } from "../context/BreadcrumbContext";
import ConfirmModal from "../components/ConfirmModal";
import QuantityInput from "../components/QuantityInput";
import SearchableSelect from "../components/SearchableSelect";
import StatusPill from "../components/StatusPill";
import StockCountReviewModal from "../components/StockCountReviewModal";
import StockCountSheet from "../components/StockCountSheet";
import { errorText } from "../utils/errors";
import {
  formatPersianDate,
  formatQuantity,
  toPersianDigits,
} from "../utils/formatters";
import { STOCK_COUNT_STATUSES } from "../utils/stockCountStatus";
import {
  primaryButton,
  secondaryButton,
  searchField,
  searchIcon,
} from "../utils/tableClasses";
import type { Item, StockCountDetail, StockCountLine } from "../types/api";

type SaveState = "idle" | "saving" | "saved" | "error";
type Filter = "all" | "uncounted" | "different";

/** Persian digits typed into the search find Latin codes too. */
function normalize(text: string): string {
  return text
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .toLowerCase()
    .trim();
}

/** «+۲»/«−۱»/«✓» — the difference, once a line is counted and may be shown. */
function Difference({ line }: { line: StockCountLine }) {
  if (line.difference === null) return null;
  if (line.difference === 0) {
    return (
      <span className="text-body-xs font-bold text-success-fg">
        بدون اختلاف
      </span>
    );
  }
  const over = line.difference > 0;
  return (
    <span
      className={`text-body-xs font-bold tabular-nums ${over ? "text-success-fg" : "text-danger-fg"}`}
    >
      {over ? "اضافه " : "کسری "}
      {formatQuantity(Math.abs(line.difference))}
    </span>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving")
    return (
      <ArrowPathIcon
        className="w-4 h-4 text-text-muted animate-spin"
        aria-label="در حال ذخیره"
      />
    );
  if (state === "saved")
    return (
      <CheckCircleIcon
        className="w-4 h-4 text-success-fg"
        aria-label="ذخیره شد"
      />
    );
  if (state === "error")
    return (
      <ExclamationCircleIcon
        className="w-4 h-4 text-danger-fg"
        aria-label="ذخیره نشد"
      />
    );
  return <span className="w-4 h-4" aria-hidden="true" />;
}

interface CountRowProps {
  countId: number;
  line: StockCountLine;
  editable: boolean;
  /** The next visible line, for «Enter» — by id, since a filter may drop
   *  this row from the list the moment it is saved. */
  nextLineId: number | null;
  onSaved: (line: StockCountLine) => void;
}

/**
 * One line of the count. Saved on its own, as soon as the counter leaves
 * the field or presses Enter — on a phone walking the shelves there is no
 * «save» button at the end to forget, and a dropped connection costs one
 * line rather than the morning.
 */
function CountRow({
  countId,
  line,
  editable,
  nextLineId,
  onSaved,
}: CountRowProps) {
  const [value, setValue] = useState<number | null>(line.counted_quantity);
  const [note, setNote] = useState(line.note ?? "");
  const [noteOpen, setNoteOpen] = useState(Boolean(line.note));
  const [state, setState] = useState<SaveState>("idle");
  const saved = useRef({ value: line.counted_quantity, note: line.note ?? "" });
  // «Enter» saves and moves on, and moving on blurs the field, which saves
  // again — one request at a time per line.
  const inFlight = useRef(false);
  // What the fields hold now, read by save() — a value typed while a save is
  // in flight is sent by the save that follows it, not lost. Written by the
  // change handlers rather than during render.
  const latest = useRef({ value, note });

  const save = async (): Promise<void> => {
    if (!editable || inFlight.current) return;
    const { value: sending, note: sendingNote } = latest.current;
    if (sending === saved.current.value && sendingNote === saved.current.note)
      return;
    inFlight.current = true;
    setState("saving");
    try {
      const res = await updateStockCountLine(countId, line.id, {
        counted_quantity: sending,
        note: sendingNote.trim() || null,
      });
      saved.current = { value: sending, note: sendingNote };
      setState("saved");
      onSaved(res.data);
    } catch (error) {
      setState("error");
      toast.error(errorText(error, `«${line.item_name}» ذخیره نشد`));
      return;
    } finally {
      inFlight.current = false;
    }
    // Typed again while that request was out: send the newer value too.
    if (
      latest.current.value !== saved.current.value ||
      latest.current.note !== saved.current.note
    ) {
      void save();
    }
  };

  const focusNext = () => {
    if (nextLineId === null) return;
    const next = document.getElementById(`count-input-${nextLineId}`);
    if (next) (next as HTMLInputElement).focus();
  };

  const counted = line.counted_quantity !== null;

  return (
    <li
      className={`rounded-panel border p-3 sm:p-4 transition-colors ${
        counted ? "bg-surface border-border" : "bg-surface-alt border-border"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-body-sm sm:text-body-md font-bold text-text-primary">
            {line.item_name}
          </p>
          <p className="text-body-xs text-text-muted">
            <span dir="ltr">{line.item_code}</span>
            {line.location && (
              <>
                {" · "}
                <span className="text-text-secondary">
                  قفسه {line.location}
                </span>
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
            {line.expected_quantity !== null && (
              <span className="text-body-xs text-text-secondary tabular-nums">
                سیستم: {formatQuantity(line.expected_quantity)} {line.item_unit}
              </span>
            )}
            <Difference line={line} />
            {line.applied_quantity !== null && (
              <span className="text-body-xs text-text-muted tabular-nums">
                اعمال شد: {line.applied_quantity > 0 ? "اضافه" : "کسری"}{" "}
                {formatQuantity(Math.abs(line.applied_quantity))}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <SaveIndicator state={state} />
          <div className="w-24 sm:w-28">
            <QuantityInput
              nullable
              id={`count-input-${line.id}`}
              value={value}
              fractional={line.item_is_fractional}
              disabled={!editable}
              onChange={(next) => {
                setValue(next);
                latest.current = { ...latest.current, value: next };
                setState("idle");
              }}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void save();
                  focusNext();
                }
              }}
              aria-label={`شمارش ${line.item_name}`}
              placeholder="—"
              className="w-full border border-border-field rounded-field px-3 py-2.5 text-body-md text-center bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow] disabled:opacity-70"
            />
            <p className="text-[11px] text-text-muted text-center mt-0.5">
              {line.item_unit}
            </p>
          </div>
        </div>
      </div>

      {editable && !noteOpen && (
        <button
          type="button"
          onClick={() => setNoteOpen(true)}
          className="mt-1 text-body-xs text-primary hover:underline cursor-pointer"
        >
          + یادداشت
        </button>
      )}
      {(noteOpen || (!editable && line.note)) && (
        <input
          type="text"
          value={note}
          maxLength={500}
          disabled={!editable}
          onChange={(e) => {
            setNote(e.target.value);
            latest.current = { ...latest.current, note: e.target.value };
            setState("idle");
          }}
          onBlur={save}
          placeholder="مثلاً: دو عدد در جعبه‌ی خراب‌ها"
          aria-label={`یادداشت ${line.item_name}`}
          className="mt-2 w-full border border-border-field rounded-field px-3 py-2 text-body-sm bg-surface text-text-primary focus:outline-none focus:border-primary disabled:opacity-70"
        />
      )}
    </li>
  );
}

/**
 * A stock count's own page (14.15) — where the shelf is counted.
 *
 * A page rather than a modal: it is opened from the list and from a link
 * someone sends a colleague, it is used for an hour on a phone, and «back»
 * has to mean the list. Built for that phone first: one column of large
 * fields, a search, and «Enter» moving to the next line.
 */
export default function StockCountDetail() {
  const { id } = useParams();
  const countId = Number(id);
  const navigate = useNavigate();
  const [count, setCount] = useState<StockCountDetail | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [reviewing, setReviewing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [adding, setAdding] = useState(false);
  const [catalogue, setCatalogue] = useState<Item[]>([]);

  usePageCrumb({
    name: count ? `انبارگردانی ${count.number}` : "انبارگردانی",
    parent: { name: "انبارگردانی", path: "/stock-counts" },
  });

  const load = useCallback(async () => {
    try {
      const res = await getStockCount(countId);
      setCount(res.data);
    } catch {
      toast.error("انبارگردانی یافت نشد");
      navigate("/stock-counts");
    }
  }, [countId, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  /** One saved line, folded back into the count without a reload. */
  const onSaved = useCallback((line: StockCountLine) => {
    setCount((current) => {
      if (!current) return current;
      const lines = current.lines.map((l) => (l.id === line.id ? line : l));
      return {
        ...current,
        lines,
        counted_count: lines.filter((l) => l.counted_quantity !== null).length,
      };
    });
  }, []);

  const visible = useMemo(() => {
    if (!count) return [];
    const term = normalize(search);
    return (
      [...count.lines]
        // The order a person walks the shelves in: by location, then name.
        .sort(
          (a, b) =>
            (a.location ?? "￿").localeCompare(b.location ?? "￿", "fa") ||
            a.item_name.localeCompare(b.item_name, "fa"),
        )
        .filter((line) => {
          if (filter === "uncounted" && line.counted_quantity !== null)
            return false;
          if (filter === "different" && !line.difference) return false;
          if (!term) return true;
          return [line.item_name, line.item_code, line.location ?? ""].some(
            (field) => normalize(field).includes(term),
          );
        })
    );
  }, [count, search, filter]);

  if (!count) {
    return (
      <div className="animate-pulse space-y-3" dir="rtl">
        <div className="h-24 rounded-panel border border-border bg-surface" />
        <div className="h-64 rounded-panel border border-border bg-surface" />
      </div>
    );
  }

  const editable = count.status === "draft";
  const revealed = !(count.blind && editable);
  const share = count.line_count ? count.counted_count / count.line_count : 0;
  const status = STOCK_COUNT_STATUSES[count.status];

  const openAdd = async () => {
    setAdding(true);
    if (catalogue.length === 0) {
      try {
        const res = await getItems({ limit: 1000 });
        setCatalogue(res.data.data);
      } catch {
        toast.error("خطا در دریافت فهرست کالاها");
      }
    }
  };

  const addItem = async (itemId: number) => {
    try {
      const res = await addStockCountLine(countId, itemId);
      setCount((current) =>
        current
          ? {
              ...current,
              lines: [...current.lines, res.data],
              line_count: current.line_count + 1,
            }
          : current,
      );
      setAdding(false);
      setSearch(res.data.item_name);
      toast.success(`«${res.data.item_name}» به شمارش اضافه شد`);
    } catch (error) {
      toast.error(errorText(error, "خطا در افزودن کالا"));
    }
  };

  const doCancel = async () => {
    setCancelling(true);
    try {
      const res = await cancelStockCount(countId);
      setCount(res.data);
      setConfirmCancel(false);
      toast.success("انبارگردانی لغو شد");
    } catch (error) {
      toast.error(errorText(error, "خطا در لغو انبارگردانی"));
    } finally {
      setCancelling(false);
    }
  };

  const inCount = new Set(count.lines.map((l) => l.item_id));

  return (
    <div dir="rtl" className="max-w-4xl mx-auto">
      {/* Header: what this count is and how far it has got */}
      <div className="bg-surface border border-border rounded-panel shadow-sm p-4 sm:p-5 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-title-sm font-bold text-text-primary">
                {count.number}
              </h1>
              <StatusPill
                label={status.label}
                color={status.color}
                tone={status.tone}
                size="sm"
              />
              {count.blind && (
                <StatusPill
                  label="شمارش کور"
                  color="var(--text-muted)"
                  tone="bg-surface-alt text-text-secondary"
                  size="sm"
                />
              )}
            </div>
            <p className="text-body-sm text-text-secondary mt-1">
              {count.warehouse_name} ·{" "}
              {count.category_name
                ? `فقط ${count.category_name}`
                : "همه‌ی کالاها"}{" "}
              · {formatPersianDate(count.created_at)}
            </p>
            {count.description && (
              <p className="text-body-xs text-text-muted mt-1">
                {count.description}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setPrinting(true)}
              className={secondaryButton}
            >
              <PrinterIcon className="w-4 h-4" aria-hidden="true" />
              برگه‌ی شمارش
            </button>
            {editable && (
              <button
                onClick={() => setReviewing(true)}
                className={primaryButton}
              >
                بررسی و اعمال
              </button>
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex justify-between text-body-xs text-text-secondary mb-1 tabular-nums">
            <span>
              {toPersianDigits(count.counted_count)} از{" "}
              {toPersianDigits(count.line_count)} کالا شمرده شده
            </span>
            <span>٪{toPersianDigits(Math.round(share * 100))}</span>
          </div>
          <div className="h-2 rounded-pill bg-surface-alt overflow-hidden">
            <div
              className="h-full rounded-pill bg-primary transition-[width]"
              style={{ width: `${Math.round(share * 100)}%` }}
            />
          </div>
        </div>

        {count.status === "applied" && (
          <p className="mt-3 text-body-sm text-success-fg">
            در {formatPersianDate(count.applied_at)}
            {count.applied_by_name ? ` توسط ${count.applied_by_name}` : ""} روی
            موجودی اعمال شد.
          </p>
        )}
        {count.status === "cancelled" && (
          <p className="mt-3 text-body-sm text-text-muted">
            این انبارگردانی لغو شده و روی موجودی اثری نداشته است.
          </p>
        )}
      </div>

      {/* Find a line */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className={searchIcon} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجوی نام، کد یا قفسه..."
            aria-label="جستجو"
            className={searchField}
          />
        </div>
        <div
          role="tablist"
          aria-label="فیلتر"
          className="flex rounded-field border border-border bg-surface overflow-hidden shrink-0"
        >
          {(
            [
              ["all", "همه"],
              ["uncounted", "شمرده‌نشده"],
              ...(revealed ? [["different", "دارای اختلاف"]] : []),
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={`flex-1 px-3 py-2.5 text-body-sm font-bold whitespace-nowrap cursor-pointer transition-colors ${
                filter === key
                  ? "bg-primary text-primary-fg"
                  : "text-text-secondary hover:bg-surface-alt"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {editable && (
          <button
            onClick={() => void openAdd()}
            className={`${secondaryButton} shrink-0`}
          >
            <PlusIcon className="w-4 h-4" aria-hidden="true" />
            افزودن کالا
          </button>
        )}
      </div>

      {adding && (
        <div className="bg-surface border border-border rounded-panel p-3 mb-3 flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="flex-1">
            <SearchableSelect
              options={catalogue
                .filter((item) => !inCount.has(item.id))
                .map((item) => ({
                  value: item.id,
                  label: `[${item.code}] ${item.name}`,
                }))}
              value=""
              onChange={(value) => void addItem(Number(value))}
              placeholder="کالایی که در فهرست نیست..."
            />
          </div>
          <button
            onClick={() => setAdding(false)}
            className="text-body-sm text-text-secondary hover:text-text-primary px-3 py-2 cursor-pointer"
          >
            انصراف
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-center text-body-sm text-text-secondary py-10">
          {filter === "uncounted"
            ? "همه‌ی کالاها شمرده شده‌اند."
            : "کالایی با این جستجو نیست."}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((line, index) => (
            <CountRow
              key={line.id}
              countId={countId}
              line={line}
              editable={editable}
              nextLineId={visible[index + 1]?.id ?? null}
              onSaved={onSaved}
            />
          ))}
        </ul>
      )}

      {editable && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setConfirmCancel(true)}
            className="text-body-sm text-danger-fg hover:underline cursor-pointer"
          >
            لغو این انبارگردانی
          </button>
        </div>
      )}

      {reviewing && (
        <StockCountReviewModal
          count={count}
          onClose={() => setReviewing(false)}
          onApplied={(applied) => {
            setCount(applied);
            setReviewing(false);
          }}
        />
      )}

      {printing && (
        <StockCountSheet count={count} onClose={() => setPrinting(false)} />
      )}

      <ConfirmModal
        isOpen={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={doCancel}
        title="لغو انبارگردانی"
        message="شمارش‌های ثبت‌شده روی موجودی اعمال نمی‌شوند و این انبارگردانی دیگر قابل ادامه نیست. شماره‌ی آن در سوابق می‌ماند."
        confirmText="لغو شود"
        variant="danger"
        loading={cancelling}
      />
    </div>
  );
}
