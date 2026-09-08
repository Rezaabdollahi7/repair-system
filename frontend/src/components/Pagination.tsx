import { toPersianDigits } from "../utils/formatters";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
} from "@heroicons/react/24/solid";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}

/** Page numbers around the current one, with … where a run was skipped. */
function pageWindow(page: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const around = [page - 1, page, page + 1].filter(
    (p) => p > 1 && p < totalPages,
  );
  const pages: (number | "gap")[] = [1];

  if (around[0] !== undefined && around[0] > 2) pages.push("gap");
  pages.push(...around);
  const last = around[around.length - 1];
  if (last !== undefined && last < totalPages - 1) pages.push("gap");
  pages.push(totalPages);

  return pages;
}

const STEP_CLASS =
  "w-9 h-9 flex items-center justify-center rounded-field border border-border " +
  "text-text-secondary hover:bg-surface-alt hover:text-text-primary transition-colors " +
  "disabled:opacity-40 disabled:pointer-events-none cursor-pointer";

export default function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  onLimitChange,
}: PaginationProps) {
  if (total <= 0 || totalPages <= 0) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 text-body-sm text-text-secondary">
      {/*
        dir="ltr" and the source order from→to.

        This line used to be written {to}–{from}, on the assumption that the
        bidi algorithm would swap the pair back inside an RTL paragraph. It
        does not: two numbers joined by a dash are one numeric run and keep
        their source order, so page one of forty-two announced itself as
        "نمایش ۱۰–۱". The span makes the direction explicit rather than
        relying on which neutral character happens to sit between them.
      */}
      <span>
        نمایش{" "}
        <span dir="ltr" className="inline-block">
          {toPersianDigits(from)}–{toPersianDigits(to)}
        </span>{" "}
        از {toPersianDigits(total)}
      </span>

      {/*
        dir="ltr": the controls are an ordered number line, and mirroring it
        puts page 1 on the right with the "next" chevron pointing away from
        the direction the numbers grow.
      */}
      <nav
        dir="ltr"
        aria-label="صفحه‌بندی"
        className="flex items-center gap-1.5"
      >
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          aria-label="صفحهٔ اول"
          className={STEP_CLASS}
        >
          <ChevronDoubleLeftIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          aria-label="صفحهٔ قبل"
          className={STEP_CLASS}
        >
          <ChevronLeftIcon className="w-4 h-4" />
        </button>

        {pageWindow(page, totalPages).map((entry, index) =>
          entry === "gap" ? (
            <span
              key={`gap-${index}`}
              aria-hidden
              className="w-6 text-center text-text-muted"
            >
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              onClick={() => onPageChange(entry)}
              aria-current={entry === page ? "page" : undefined}
              className={`w-9 h-9 rounded-field text-body-sm font-bold transition-colors cursor-pointer ${
                entry === page
                  ? "bg-primary text-primary-fg"
                  : "border border-border text-text-primary hover:bg-surface-alt"
              }`}
            >
              {toPersianDigits(entry)}
            </button>
          ),
        )}

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          aria-label="صفحهٔ بعد"
          className={STEP_CLASS}
        >
          <ChevronRightIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          aria-label="صفحهٔ آخر"
          className={STEP_CLASS}
        >
          <ChevronDoubleRightIcon className="w-4 h-4" />
        </button>
      </nav>

      <select
        value={limit}
        onChange={(e) => onLimitChange(Number(e.target.value))}
        aria-label="تعداد در هر صفحه"
        className="border border-border-field rounded-field px-2.5 py-2 bg-surface text-text-primary
                   text-body-sm hover:border-border-strong focus:outline-none
                   focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)]
                   transition-[border-color,box-shadow] cursor-pointer"
      >
        {[5, 10, 20, 50].map((n) => (
          <option key={n} value={n}>
            {n} در صفحه
          </option>
        ))}
      </select>
    </div>
  );
}
