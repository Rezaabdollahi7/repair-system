/**
 * The one badge shape the app uses for a state.
 *
 * There were five of these by now — repair status, stock level, and three
 * separate payment badges, one per invoice page — all drawing the same pill
 * with the same dot and disagreeing on the details. This is the shape; the
 * domain modules say what goes in it.
 *
 * Two variants, because the app has two honest kinds of state:
 *
 * - **tone**: a reserved semantic pair (`bg-success-soft text-success-fg` and
 *   friends). For anything that is a *severity* — paid vs unpaid, in stock vs
 *   out. The label itself is coloured, which is legible because those `*-fg`
 *   steps are chosen to clear 4.5:1 on their own soft background.
 *
 * - **tint**: a wash of an arbitrary colour mixed toward the surface, with
 *   the label in ordinary ink. For anything that is an *identity* — the nine
 *   repair statuses, which take chart series slots. Their colours are marks,
 *   not text: white on the gold of `pending` is 3.1:1, so the label cannot
 *   wear the hue and the dot carries it instead.
 */
export default function StatusPill({
  label,
  color,
  tone,
  extra,
  size = "md",
}: {
  label: string;
  /** The dot's colour. Any CSS colour; a custom property follows the theme. */
  color: string;
  /** Tailwind pair for the severity variant. Omit for the tint variant. */
  tone?: string;
  /** Trailing content — a quantity, a share. Rendered in tabular figures. */
  extra?: React.ReactNode;
  /** `sm` for a dense table row. */
  size?: "sm" | "md";
}) {
  const padding = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill font-bold
                  whitespace-nowrap text-body-xs ${padding} ${
                    tone ? tone : "border text-text-primary"
                  }`}
      style={
        tone
          ? undefined
          : {
              backgroundColor: `color-mix(in oklab, ${color} 14%, var(--surface))`,
              borderColor: `color-mix(in oklab, ${color} 32%, var(--surface))`,
            }
      }
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {label}
      {extra !== undefined && (
        <span className="tabular-nums opacity-80">{extra}</span>
      )}
    </span>
  );
}
