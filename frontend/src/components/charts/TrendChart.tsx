import { useId, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  formatPersianCompact,
  formatPersianCurrency,
  toPersianDigits,
} from "../../utils/formatters";
import { jalaliDayAndMonth, jalaliDayOf } from "../../utils/jalali";
import {
  ChartEmpty,
  ChartTable,
  ChartTooltip,
  Legend,
  type TooltipState,
} from "./chartKit";
import { SERIES } from "../../utils/chartSeries";
import { useElementWidth } from "./useElementWidth";

export interface TrendPoint {
  /** `YYYY-MM-DD`, a UTC day key, oldest first. */
  date: string;
  repair: number;
  sale: number;
}

const HEIGHT = 240;
/** `top` leaves room for the unit caption sitting above the axis. */
const PAD = { top: 28, right: 12, bottom: 26 };

/**
 * Width of the gutter the y-axis labels are set in. Four Persian digits at
 * 11px, plus the 8px the labels stand off the plot.
 */
const GUTTER = 44;

/**
 * The unit the axis is scaled in, named once instead of repeated on every
 * gridline.
 *
 * Writing «۱۵۰ میلیون / ۱۰۰ میلیون / ۵۰ میلیون» spends three quarters of
 * each label on a word that does not change, and at that length the widest
 * of them needed a fifth of a phone-width card before the plot got any. The
 * unit goes above the axis; the labels are bare numbers.
 *
 * Full rial amounts are still what the tooltip and the table show — nothing
 * here is the only place a figure appears.
 */
function unitOf(ceiling: number): { divisor: number; name: string } {
  if (ceiling >= 1_000_000_000)
    return { divisor: 1_000_000_000, name: "میلیارد ریال" };
  if (ceiling >= 1_000_000) return { divisor: 1_000_000, name: "میلیون ریال" };
  if (ceiling >= 1_000) return { divisor: 1_000, name: "هزار ریال" };
  return { divisor: 1, name: "ریال" };
}

/** A gridline's value in that unit: `۱۵۰`, or `۱٫۵` when the step is fractional. */
function axisLabel(value: number, divisor: number): string {
  const scaled = value / divisor;
  const text = Number.isInteger(scaled)
    ? String(scaled)
    : scaled.toFixed(1).replace(/\.0$/, "");
  return toPersianDigits(text).replace(".", "٫");
}
/** Three lines and the baseline: enough to read a value off, few enough to recede. */
const GRID_LINES = 3;

/*
 * `filled` is the second encoding channel, and the reason only one series has
 * it: two translucent areas stacked on the same baseline mix wherever they
 * overlap, and on the day one series crosses the other the reader cannot say
 * which band is which. One filled series and one line reads cleanly at every
 * crossing, and the difference in form means the two are still told apart by
 * someone who cannot separate the hues.
 */
const LINES = [
  { key: "repair" as const, label: "تعمیر", color: SERIES[0], filled: true },
  { key: "sale" as const, label: "فروش", color: SERIES[1], filled: false },
];

/**
 * Nudges the top of the scale up to a round number so the gridline labels
 * are readable — an axis topping out at ۱۲٫۴ میلیون is arithmetic, one
 * topping out at ۱۵ میلیون is a scale.
 */
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;
  // Half steps as well as whole ones. With only 1/2/5/10 to choose from, a
  // peak of 146 rounded up to 200 and the lines then used two-thirds of the
  // height they had; 1.5 gives them 97% of it.
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];
  const step = steps.find((candidate) => normalised <= candidate) ?? 10;
  return step * magnitude;
}

/**
 * Daily repair and sale revenue over the window the API returned.
 *
 * Time runs right to left. That is the direction the rest of the page reads,
 * and it is what the device-status bars beside it already do — a chart whose
 * newest point is on the left while every list on the screen starts on the
 * right makes the reader change direction mid-glance.
 */
export default function TrendChart({ series }: { series: TrendPoint[] }) {
  const reduceMotion = useReducedMotion();
  // Gradient ids are document-global; a second TrendChart on the same page
  // would otherwise define the same id and both would take the first one.
  const gradientId = useId();
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const totals = useMemo(
    () => ({
      repair: series.reduce((sum, point) => sum + point.repair, 0),
      sale: series.reduce((sum, point) => sum + point.sale, 0),
    }),
    [series],
  );

  const geometry = useMemo(() => {
    if (width === 0 || series.length < 2) return null;

    const plotWidth = width - GUTTER - PAD.right;
    const plotHeight = HEIGHT - PAD.top - PAD.bottom;
    const peak = Math.max(
      ...series.flatMap((point) => [point.repair, point.sale]),
      0,
    );
    const ceiling = niceCeiling(peak);

    // 1 - t, not t: index 0 is the oldest day and belongs on the right.
    const xOf = (index: number) =>
      GUTTER + (1 - index / (series.length - 1)) * plotWidth;
    const yOf = (value: number) =>
      PAD.top + plotHeight - (value / ceiling) * plotHeight;

    return { plotWidth, plotHeight, ceiling, xOf, yOf };
  }, [width, series]);

  if (series.length < 2) {
    return <ChartEmpty message="برای رسم روند به داده‌ٔ بیشتری نیاز است" />;
  }

  const handleMove = (event: React.MouseEvent<SVGRectElement>) => {
    if (!geometry) return;
    const box = event.currentTarget.getBoundingClientRect();
    const offset = event.clientX - box.left;
    // Invert the right-to-left mapping to get back to an index.
    const ratio = 1 - (offset - GUTTER) / geometry.plotWidth;
    const index = Math.min(
      series.length - 1,
      Math.max(0, Math.round(ratio * (series.length - 1))),
    );
    show(index);
  };

  const show = (index: number) => {
    if (!geometry) return;
    const point = series[index];
    setActiveIndex(index);
    setTooltip({
      x: (geometry.xOf(index) / width) * 100,
      y: (geometry.yOf(Math.max(point.repair, point.sale)) / HEIGHT) * 100,
      title: jalaliDayAndMonth(point.date),
      rows: LINES.map((line) => ({
        label: line.label,
        value: `${formatPersianCurrency(point[line.key])} ریال`,
        color: line.color,
      })),
    });
  };

  const clear = () => {
    setActiveIndex(null);
    setTooltip(null);
  };

  const gridValues = Array.from(
    { length: GRID_LINES + 1 },
    (_, i) => ((geometry?.ceiling ?? 0) * i) / GRID_LINES,
  );
  const unit = unitOf(geometry?.ceiling ?? 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <Legend
          entries={LINES.map((line) => ({
            label: line.label,
            color: line.color,
            value: formatPersianCompact(totals[line.key]),
          }))}
        />
      </div>

      <div ref={ref} className="relative">
        {geometry && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`روند درآمد روزانه؛ جمع تعمیر ${formatPersianCompact(totals.repair)} ریال و جمع فروش ${formatPersianCompact(totals.sale)} ریال. جدول اعداد پایین نمودار است.`}
            className="block overflow-visible"
            /*
             * LTR inside the SVG, even though the page is RTL.
             *
             * `text-anchor: end` is resolved against the element's direction,
             * so under the inherited RTL it anchored each y-axis label by its
             * left edge and drew the text rightwards — straight over the plot.
             * The geometry in this file is written in absolute coordinates and
             * has to be read that way. The labels themselves are still Persian
             * runs and the bidi algorithm orders them correctly regardless.
             */
            style={{ direction: "ltr" }}
          >
            <defs>
              {LINES.filter((line) => line.filled).map((line) => (
                <linearGradient
                  key={line.key}
                  id={`${gradientId}-${line.key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  {/* The fill is a hint of where the line has been, not a
                      second mark, so it fades out before the baseline. */}
                  <stop offset="0%" stopColor={line.color} stopOpacity="0.24" />
                  <stop offset="100%" stopColor={line.color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>

            {/* The unit, once, at the head of the axis. */}
            <text
              x={GUTTER - 8}
              y={12}
              textAnchor="end"
              className="fill-text-muted"
              style={{ fontSize: 10 }}
            >
              {unit.name}
            </text>

            {/* Grid and its labels. Recessive on purpose — the reader should
                see the shape first and reach for the scale second. */}
            {gridValues.map((value, index) => {
              const y = geometry.yOf(value);
              return (
                <g key={index}>
                  <line
                    x1={GUTTER}
                    x2={width - PAD.right}
                    y1={y}
                    y2={y}
                    stroke="var(--chart-grid)"
                    strokeWidth={1}
                    strokeDasharray={index === 0 ? undefined : "3 4"}
                  />
                  <text
                    x={GUTTER - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-text-muted"
                    style={{ fontSize: 11 }}
                  >
                    {index === 0 ? "۰" : axisLabel(value, unit.divisor)}
                  </text>
                </g>
              );
            })}

            {/* Day labels, thinned so they never collide: every other one on
                a narrow card, every one when there is room. */}
            {series.map((point, index) => {
              const stride = geometry.plotWidth / series.length < 32 ? 2 : 1;
              if (index % stride !== 0) return null;
              return (
                <text
                  key={point.date}
                  x={geometry.xOf(index)}
                  y={HEIGHT - 8}
                  textAnchor="middle"
                  className="fill-text-muted"
                  style={{ fontSize: 11 }}
                >
                  {jalaliDayOf(point.date)}
                </text>
              );
            })}

            {LINES.map((line) => {
              const points = series.map(
                (point, index) =>
                  `${geometry.xOf(index)},${geometry.yOf(point[line.key])}`,
              );
              const baseline = geometry.yOf(0);
              const area = `M ${geometry.xOf(0)},${baseline} L ${points.join(" L ")} L ${geometry.xOf(series.length - 1)},${baseline} Z`;

              return (
                <g key={line.key}>
                  {line.filled && (
                    <path d={area} fill={`url(#${gradientId}-${line.key})`} />
                  )}
                  <motion.polyline
                    points={points.join(" ")}
                    fill="none"
                    stroke={line.color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={reduceMotion ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { duration: 0.9, ease: [0.16, 1, 0.3, 1] }
                    }
                  />
                </g>
              );
            })}

            {/* Crosshair and the two dots on it. Drawn after the lines so the
                dots sit on top, each with a surface-coloured ring so it reads
                as a marker rather than a kink in the line. */}
            {activeIndex !== null && (
              <g>
                <line
                  x1={geometry.xOf(activeIndex)}
                  x2={geometry.xOf(activeIndex)}
                  y1={PAD.top}
                  y2={geometry.yOf(0)}
                  stroke="var(--border-strong)"
                  strokeWidth={1}
                />
                {LINES.map((line) => (
                  <circle
                    key={line.key}
                    cx={geometry.xOf(activeIndex)}
                    cy={geometry.yOf(series[activeIndex][line.key])}
                    r={5}
                    fill={line.color}
                    stroke="var(--chart-surface)"
                    strokeWidth={2}
                  />
                ))}
              </g>
            )}

            {/* One transparent capture rect over the whole plot. Per-point hit
                areas would each be a few pixels wide at this density. */}
            <rect
              x={GUTTER}
              y={PAD.top}
              width={geometry.plotWidth}
              height={geometry.plotHeight}
              fill="transparent"
              onMouseMove={handleMove}
              onMouseLeave={clear}
            />
          </svg>
        )}
        <ChartTooltip state={tooltip} />
      </div>

      <ChartTable
        caption="نمایش اعداد به‌صورت جدول"
        columns={["روز", "تعمیر (ریال)", "فروش (ریال)"]}
        rows={[...series]
          .reverse()
          .map((point) => [
            jalaliDayAndMonth(point.date),
            formatPersianCurrency(point.repair),
            formatPersianCurrency(point.sale),
          ])}
      />
    </div>
  );
}
