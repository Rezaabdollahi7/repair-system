import { motion, useReducedMotion } from "framer-motion";
import { ChartEmpty } from "./chartKit";

export interface DivergingRow {
  label: string;
  /** Signed. Negative bars grow the other way from the baseline. */
  value: number;
  /** Already formatted and already in Persian digits. */
  display: string;
}

/**
 * Signed magnitudes as bars growing either side of a shared baseline.
 *
 * `BarList` cannot do this: it scales a bar as `value / peak`, so a negative
 * value produces a negative width and the bar vanishes. A loss is the one
 * thing a profit report exists to surface, so it needs a form that can draw
 * one.
 *
 * Two hues and a neutral midpoint, which is what a diverging scale is — and
 * here the two hues are the reserved success and danger, legitimately: profit
 * versus loss is a polarity with a fixed meaning, not two arbitrary
 * categories. The baseline is drawn, not implied; without it the reader has
 * to infer where zero is from the bars themselves.
 *
 * Both arms share one scale, taken from the largest magnitude in either
 * direction, so a 10m profit and a 10m loss draw the same length.
 */
export default function DivergingBarList({
  rows,
  emptyMessage,
}: {
  rows: DivergingRow[];
  emptyMessage: string;
}) {
  const reduceMotion = useReducedMotion();
  if (rows.length === 0) return <ChartEmpty message={emptyMessage} />;

  const peak = Math.max(...rows.map((row) => Math.abs(row.value)), 1);

  return (
    <ul className="space-y-3">
      {rows.map((row, index) => {
        const positive = row.value >= 0;
        const share = Math.max((Math.abs(row.value) / peak) * 50, 0.6);

        return (
          <li key={`${row.label}-${index}`}>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <span className="text-body-sm text-text-primary truncate min-w-0">
                {row.label}
              </span>
              {/* A direct label on every bar: with a diverging scale the sign
                  is carried by which way the bar points, and that is easy to
                  misread at a glance without the number beside it. */}
              <span
                className={`text-body-sm font-bold tabular-nums shrink-0 ${
                  positive ? "text-success-fg" : "text-danger-fg"
                }`}
              >
                {row.display}
              </span>
            </div>

            <div className="relative h-2.5 rounded-pill bg-chart-track overflow-hidden">
              {/*
                The zero line. Centred, and drawn over the track rather than
                between two halves — a gap in the middle would read as a
                third state.
              */}
              <span
                className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px
                           bg-text-muted/50 z-10"
                aria-hidden="true"
              />
              {/*
                Profit grows toward the reading start — the right, in RTL —
                and a loss the other way, which is the mirror of the LTR
                convention rather than a change of it.
                -----------------------------------------------------------
                Which logical inset does that is the easy thing to get
                backwards, and the first version was: in RTL
                `inset-inline-start` resolves to `right`, so pinning it at 50%
                puts the bar's *right* edge on the baseline and the bar grows
                leftward. A profit needs `inset-inline-end` — `left` — so its
                left edge sits on the baseline and it grows rightward.
              */}
              <motion.span
                className="absolute inset-y-0 rounded-pill"
                style={{
                  backgroundColor: positive
                    ? "var(--success)"
                    : "var(--danger)",
                  insetInlineEnd: positive ? "50%" : undefined,
                  insetInlineStart: positive ? undefined : "50%",
                }}
                initial={reduceMotion ? false : { width: 0 }}
                animate={{ width: `${share}%` }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : {
                        duration: 0.5,
                        delay: 0.04 * index,
                        ease: [0.16, 1, 0.3, 1],
                      }
                }
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
