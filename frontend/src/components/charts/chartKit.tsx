/**
 * Shared pieces every chart on the dashboard is built from.
 *
 * Hand-rolled SVG rather than a charting library, for three reasons that all
 * came up while drawing these: the numbers have to render as Persian digits
 * (every library ships Latin ones and most give you no hook), time has to
 * flow right-to-left to match the page (libraries treat that as a bug), and
 * the marks have to take their colour from CSS custom properties so a theme
 * switch repaints them without JavaScript. A library would have been fought
 * on all three, and these four charts are a few hundred lines of geometry.
 */

/* ── Card shell ─────────────────────────────────────────────────────── */

interface ChartCardProps {
  title: string;
  /** Sits under the title in muted ink — the unit, the window, the total. */
  subtitle?: string;
  /** Top-left corner: a legend, a filter, a headline figure. */
  aside?: React.ReactNode;
  tone?: "surface" | "ink" | "accent";
  className?: string;
  children: React.ReactNode;
}

const CARD_TONE: Record<NonNullable<ChartCardProps["tone"]>, string> = {
  surface: "bg-surface border-border",
  // The one dark card per screen. Its own text colours are set here rather
  // than inherited, because --text-primary follows the theme and on the light
  // theme it would put near-black text on a near-black card — which is
  // exactly what happened the first time this card was drawn.
  //
  // --accent is overridden for the same reason. The light theme's accent is a
  // deep blue meant to carry white text, and on this near-black panel it
  // measures 2.55:1 — the figure inside this card was drawn in it, and it
  // came out barely there. Inside the panel the accent is the dark theme's
  // lighter step, whichever theme is on outside.
  ink: "bg-panel-ink border-panel-ink-border [--text-primary:#f1f3f8] [--text-secondary:#b4b9c6] [--text-muted:#969ba8] [--accent:#6ea8fa] [--accent-hover:#8ec0fc] [--accent-fg:#2d3038] [--chart-track:var(--panel-ink-track)]",
  accent: "bg-accent border-accent-border text-accent-fg",
};

export function ChartCard({
  title,
  subtitle,
  aside,
  tone = "surface",
  className = "",
  children,
}: ChartCardProps) {
  return (
    <section
      className={`rounded-panel border p-5 shadow-sm ${CARD_TONE[tone]} ${className}`}
    >
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-title-sm font-bold text-text-primary">{title}</h2>
          {subtitle && (
            <p className="text-body-xs text-text-muted mt-0.5">{subtitle}</p>
          )}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

/* ── Legend ─────────────────────────────────────────────────────────── */

export interface LegendEntry {
  label: string;
  color: string;
  /** Rendered as-is; already formatted and already in Persian digits. */
  value?: string;
}

/**
 * Always present from two series up, because identity must never rest on
 * colour alone — a reader who cannot separate two hues still has the list.
 * The label wears text ink, not the series colour; the swatch beside it is
 * what carries the identity.
 */
export function Legend({ entries }: { entries: LegendEntry[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {entries.map((entry) => (
        <li
          key={entry.label}
          className="flex items-center gap-1.5 text-body-xs text-text-secondary"
        >
          <span
            className="w-2.5 h-2.5 rounded-[3px] shrink-0"
            style={{ backgroundColor: entry.color }}
            aria-hidden="true"
          />
          <span>{entry.label}</span>
          {entry.value && (
            <span className="font-bold text-text-primary tabular-nums">
              {entry.value}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ── Table fallback ─────────────────────────────────────────────────── */

/**
 * The same numbers as a real table, collapsed behind a <details>.
 *
 * Not a nicety: it is the relief channel the palette's contrast check
 * requires, the answer for a screen reader that cannot walk an SVG, and the
 * only way to read an exact value on a touch screen with no hover. Closed by
 * default so it costs no space.
 */
export function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <details className="mt-4 group">
      <summary className="text-body-xs text-text-muted cursor-pointer hover:text-text-secondary transition-colors w-fit">
        {caption}
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-body-xs">
          <thead>
            <tr className="text-text-muted">
              {columns.map((column) => (
                <th key={column} className="text-right font-medium py-1 px-2">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-t border-border-subtle">
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="py-1 px-2 text-text-secondary tabular-nums"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/* ── Tooltip ────────────────────────────────────────────────────────── */

export interface TooltipState {
  /**
   * Percentages of the plot box, measured from its **left** and **top**
   * edges, so the bubble follows a resize.
   *
   * Deliberately physical rather than logical. The first version of this
   * placed the bubble with `inset-inline-end`, which inside the RTL page
   * resolves to `left` — while `x` was being measured from the right. The two
   * disagreed and the bubble landed on top of the marker it was describing.
   */
  x: number;
  y: number;
  title: string;
  rows: { label: string; value: string; color?: string }[];
}

/** How far the bubble stands off the crosshair, clear of the markers on it. */
const TOOLTIP_GAP = 14;

/**
 * An absolutely-positioned bubble beside the hovered point.
 *
 * `pointer-events-none` matters more than it looks: without it the bubble
 * sits under the cursor, steals the next mousemove from the plot, and the
 * chart flickers between two adjacent points.
 */
export function ChartTooltip({ state }: { state: TooltipState | null }) {
  if (!state) return null;

  // Past the halfway mark the bubble would hang off the edge, so it moves to
  // the other side of the crosshair rather than being pushed back inside —
  // pushing it back detaches it from the point it describes.
  const flip = state.x > 55;

  return (
    <div
      className="absolute z-10 pointer-events-none rounded-field bg-panel-ink text-on-dark
                 px-2.5 py-2 shadow-lg min-w-28"
      style={{
        left: `${state.x}%`,
        top: `${state.y}%`,
        transform: `translate(${flip ? "-100%" : "0"}, -50%) translateX(${flip ? -TOOLTIP_GAP : TOOLTIP_GAP}px)`,
      }}
      role="status"
    >
      <p className="text-body-xs font-bold whitespace-nowrap">{state.title}</p>
      <ul className="mt-1 space-y-0.5">
        {state.rows.map((row) => (
          <li
            key={row.label}
            className="flex items-center gap-1.5 text-body-xs whitespace-nowrap"
          >
            {row.color && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: row.color }}
                aria-hidden="true"
              />
            )}
            <span className="text-on-dark/70">{row.label}</span>
            <span className="font-bold tabular-nums ms-auto">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Empty-state line, so the four charts say "no data" the same way. */
export function ChartEmpty({ message }: { message: string }) {
  return (
    <p className="text-center text-body-sm text-text-muted py-10">{message}</p>
  );
}
