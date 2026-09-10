import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { toPersianDigits } from "../../utils/formatters";
import { SERIES } from "../../utils/chartSeries";
import { ChartEmpty, ChartTooltip, type TooltipState } from "./chartKit";

export interface Column {
  label: string;
  value: number;
}

/** Height of the plot box. Fixed, because a bar chart's height is its scale. */
const PLOT_HEIGHT = 168;

/**
 * A count per period, as columns.
 *
 * A column chart rather than the horizontal `BarList` because this is time,
 * not a ranking: the periods have a fixed order, and a reader is looking for
 * a shape across them rather than for the biggest one. `BarList` scales
 * against its largest row for exactly the opposite reason.
 *
 * **One series, so no legend** — the card's title names what is being
 * counted, and a legend box with a single entry is furniture.
 *
 * The columns run right to left, matching the page: the oldest period is on
 * the right and time moves towards the left, which is the direction a
 * Persian reader's eye travels.
 *
 * ⚠️ That takes a plain `flex`, not `flex-row-reverse`. Inside the page's
 * `dir="rtl"` a row already lays its first child out on the right;
 * `flex-row-reverse` flips it back to left-to-right, which is how the first
 * draft ended up with مهر on the left and the tooltip pointing at the wrong
 * column.
 */
export default function ColumnChart({
  columns,
  unit,
  emptyMessage = "داده‌ای برای نمایش نیست",
  color = SERIES[0],
}: {
  columns: Column[];
  /** Follows the figure in the tooltip — «دستگاه», «فاکتور». */
  unit: string;
  emptyMessage?: string;
  color?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  if (columns.length === 0) return <ChartEmpty message={emptyMessage} />;

  /*
   * Scaled against the tallest column, with a floor of 1 so a run of empty
   * months does not divide by zero and does not draw twelve full-height
   * bars out of nothing.
   */
  const peak = Math.max(...columns.map((column) => column.value), 1);

  const total = columns.reduce((sum, column) => sum + column.value, 0);
  if (total === 0) return <ChartEmpty message={emptyMessage} />;

  return (
    <div className="relative">
      <div
        className="flex items-end gap-1 sm:gap-1.5"
        style={{ height: PLOT_HEIGHT }}
      >
        {columns.map((column, index) => {
          const ratio = column.value / peak;
          /*
           * A zero is a 2px stub rather than nothing at all: an empty month
           * with no mark reads as a month with no data, and those are
           * different claims. The stub sits on the baseline where a bar
           * would start.
           */
          const height = column.value === 0 ? 2 : Math.max(ratio * 100, 4);

          return (
            <button
              key={column.label}
              type="button"
              /*
               * The whole column strip is the hit target, not just the bar —
               * a one-device month is a four-pixel mark and nobody can hover
               * it. `justify-end` keeps the bar itself on the baseline.
               */
              className="group relative flex-1 h-full flex flex-col justify-end
                         rounded-field focus-visible:outline-none
                         focus-visible:ring-2 focus-visible:ring-primary/40"
              onMouseEnter={() =>
                setTooltip({
                  // Measured from the left edge, as ChartTooltip expects,
                  // while the strips are laid out right-to-left — hence the
                  // subtraction rather than the index alone.
                  x: ((columns.length - index - 0.5) / columns.length) * 100,
                  y: Math.max(100 - ratio * 100, 6),
                  title: column.label,
                  rows: [
                    {
                      label: unit,
                      value: toPersianDigits(column.value),
                      color,
                    },
                  ],
                })
              }
              onMouseLeave={() => setTooltip(null)}
              onFocus={() => setTooltip(null)}
              aria-label={`${column.label}: ${toPersianDigits(column.value)} ${unit}`}
            >
              <motion.span
                aria-hidden="true"
                className="block w-full rounded-t-[4px] transition-opacity
                           group-hover:opacity-80"
                style={{ backgroundColor: color }}
                initial={reduceMotion ? false : { height: 0 }}
                animate={{ height: `${height}%` }}
                transition={{
                  duration: 0.4,
                  delay: reduceMotion ? 0 : index * 0.02,
                  ease: [0.22, 1, 0.36, 1],
                }}
              />
            </button>
          );
        })}
      </div>

      {/*
        The axis. Only every third month is labelled — twelve Persian month
        names across a card collide into a grey smear, and the tooltip
        carries the exact one. The last column is always labelled, because
        "where does this end" is the first thing a reader asks of a series.
      */}
      <div className="flex gap-1 sm:gap-1.5 mt-2">
        {columns.map((column, index) => {
          const show =
            index % 3 === 0 || index === columns.length - 1 ? column : null;
          return (
            <span
              key={column.label}
              className="flex-1 text-center text-[10px] leading-tight text-text-muted truncate"
            >
              {/* The year is in the tooltip; the axis has room for a name. */}
              {show ? show.label.split(" ")[0] : ""}
            </span>
          );
        })}
      </div>

      <ChartTooltip state={tooltip} />
    </div>
  );
}
