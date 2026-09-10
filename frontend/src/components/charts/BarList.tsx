import { motion, useReducedMotion } from "framer-motion";
import { ChartEmpty } from "./chartKit";
import { SERIES } from "../../utils/chartSeries";

export interface BarRow {
  /** Also the row's key and what the table fallback prints. */
  label: string;
  /**
   * Rendered in place of `label` when the row's name is more than text —
   * the technician workload list makes each name a link to its page.
   * `label` stays the string, because a key and a table cell need one.
   */
  labelNode?: React.ReactNode;
  /** Second line under the label — a code, a share, a count. */
  meta?: string;
  value: number;
  /** Already formatted, already in Persian digits. */
  display: string;
  /**
   * Overrides the list's hue for this row alone.
   *
   * The rule below still holds — one series, one colour — and this is for the
   * row that is not part of the series. The technician workload list ends in
   * «تخصیص‌نیافته», which is an absence rather than a person: it belongs in
   * the same ranking, and painting it the same blue as the technicians would
   * say it is one of them.
   */
  color?: string;
}

/**
 * Ranked magnitudes as horizontal bars.
 *
 * Every bar is the same hue, and that is the rule rather than a shortcut:
 * these are one series of nominal things (items, statuses), so length already
 * carries the magnitude and colouring each bar differently would re-encode
 * the ranking in a channel that means identity. The rank is in the order.
 *
 * Bars grow from the right, which is where the labels start.
 */
export default function BarList({
  rows,
  emptyMessage,
  color = SERIES[0],
}: {
  rows: BarRow[];
  emptyMessage: string;
  color?: string;
}) {
  const reduceMotion = useReducedMotion();
  if (rows.length === 0) return <ChartEmpty message={emptyMessage} />;

  // Scaled against the largest bar rather than the sum: this is a ranking,
  // and against a sum every bar in a long tail collapses to a sliver.
  const peak = Math.max(...rows.map((row) => row.value), 1);

  return (
    <ul className="space-y-3">
      {rows.map((row, index) => (
        <li key={`${row.label}-${index}`}>
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className="text-body-sm text-text-primary truncate min-w-0">
              {row.labelNode ?? row.label}
              {row.meta && (
                <span className="text-body-xs text-text-muted ms-2">
                  {row.meta}
                </span>
              )}
            </span>
            {/* The value is a direct label on every bar. With five rows it is
                the fastest way to read one, and it is the relief channel the
                palette's contrast check asks for. */}
            <span className="text-body-sm font-bold text-text-primary tabular-nums shrink-0">
              {row.display}
            </span>
          </div>
          <div className="h-2.5 rounded-pill bg-chart-track overflow-hidden">
            <motion.div
              className="h-full rounded-pill origin-right"
              style={{ backgroundColor: row.color ?? color }}
              initial={reduceMotion ? false : { scaleX: 0 }}
              animate={{ scaleX: Math.max(row.value / peak, 0.02) }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : {
                      duration: 0.5,
                      delay: 0.05 * index,
                      ease: [0.16, 1, 0.3, 1],
                    }
              }
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
