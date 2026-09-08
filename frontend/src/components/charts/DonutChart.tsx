import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { toPersianDigits } from "../../utils/formatters";
import { ChartEmpty } from "./chartKit";
import { SERIES, SERIES_LIMIT, foldToOther } from "./series";

export interface DonutSlice {
  label: string;
  value: number;
}

const SIZE = 168;
const STROKE = 22;
/** Radius of the ring's centreline, which is what the arc is drawn along. */
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** A 2px gap of surface between neighbouring segments, in arc length. */
const GAP = 2;

/**
 * Composition as a ring, with the total in the hole and a labelled list
 * beside it.
 *
 * Colour is doing identity work here — which status a segment is — which is
 * the one job a categorical palette exists for. The bars this replaced were
 * deliberately monochrome, because at the time the only palette available was
 * the semantic one, and spending good/warning/danger on nine workflow states
 * would have implied severities that do not exist. With a real series palette
 * the objection goes away; the reserved status colours are still untouched.
 *
 * Past eight statuses the ninth does not get a new colour: the smallest are
 * summed into «سایر», with their count, so the ring never runs out of hues.
 */
export default function DonutChart({
  slices,
  centreLabel,
  emptyMessage = "داده‌ای برای نمایش نیست",
}: {
  slices: DonutSlice[];
  centreLabel: string;
  emptyMessage?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);

  const { kept, other, otherCount } = foldToOther(slices, SERIES_LIMIT);
  // «سایر» carries its own count: a legend entry that says only "other" is
  // hiding the tail rather than summarising it. Written with a dash rather
  // than brackets — bidi mirrors a bracket pair around Persian text and the
  // label comes out looking broken.
  const rows =
    other > 0
      ? [
          ...kept,
          { label: `سایر — ${toPersianDigits(otherCount)} مورد`, value: other },
        ]
      : kept;

  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (total === 0) return <ChartEmpty message={emptyMessage} />;

  /*
   * Walk the ring once, converting each share into a dash segment. The gap is
   * subtracted from the drawn length rather than added between segments, so
   * the shares still sum to the full circumference.
   *
   * A plain loop rather than a `.map` with a running total outside it: the
   * offset of a segment depends on every segment before it, and a callback
   * that mutates a variable it closed over is what the immutability lint rule
   * objects to — rightly, since under a re-render it is easy to get wrong.
   */
  const arcs: {
    label: string;
    value: number;
    color: string;
    dash: number;
    offset: number;
    share: number;
  }[] = [];

  let cursor = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const length = (row.value / total) * CIRCUMFERENCE;
    arcs.push({
      ...row,
      color: SERIES[index],
      // A one-slice ring has no neighbour to be separated from, and a segment
      // shorter than the gap would otherwise render as a negative dash.
      dash: rows.length === 1 ? length : Math.max(length - GAP, 0.5),
      offset: cursor,
      share: (row.value / total) * 100,
    });
    cursor += length;
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          role="img"
          aria-label={`${centreLabel}: ${toPersianDigits(total)}. سهم هر وضعیت در فهرست کنار نمودار آمده است.`}
          /* -90deg puts the first segment at twelve o'clock, and the flip
             makes the ring fill anticlockwise — the same right-to-left
             direction as everything else on the page. */
          style={{ transform: "rotate(-90deg) scaleX(-1)" }}
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--chart-track)"
            strokeWidth={STROKE}
          />
          {arcs.map((arc, index) => (
            <motion.circle
              key={arc.label}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={arc.color}
              strokeWidth={active === index ? STROKE + 4 : STROKE}
              strokeDasharray={`${arc.dash} ${CIRCUMFERENCE - arc.dash}`}
              strokeDashoffset={-arc.offset}
              strokeLinecap="butt"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.4, delay: 0.05 * index }
              }
              style={{ transition: "stroke-width 150ms ease-out" }}
            />
          ))}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-title-lg font-bold text-text-primary tabular-nums leading-none">
            {toPersianDigits(active === null ? total : arcs[active].value)}
          </span>
          <span className="text-body-xs text-text-muted mt-1 px-6 text-center leading-tight">
            {active === null ? centreLabel : arcs[active].label}
          </span>
        </div>
      </div>

      {/*
        The legend is also the value list. Splitting them would print every
        number twice, and a ring with nine numbers written around it is the
        chart this replaced.
      */}
      <ul className="w-full min-w-0 space-y-1">
        {arcs.map((arc, index) => (
          <li key={arc.label}>
            <button
              type="button"
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
              className="w-full flex items-center gap-2 py-1 px-1.5 rounded-field text-right
                         hover:bg-surface-alt transition-colors cursor-pointer"
            >
              <span
                className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                style={{ backgroundColor: arc.color }}
                aria-hidden="true"
              />
              <span className="text-body-xs text-text-secondary truncate">
                {arc.label}
              </span>
              <span className="ms-auto shrink-0 flex items-baseline gap-1.5">
                <span className="text-body-xs font-bold text-text-primary tabular-nums">
                  {toPersianDigits(arc.value)}
                </span>
                <span className="text-body-xs text-text-muted tabular-nums">
                  ٪{toPersianDigits(Math.round(arc.share))}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
