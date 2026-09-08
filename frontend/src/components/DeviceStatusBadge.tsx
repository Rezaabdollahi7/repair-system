import { deviceStatusOf } from "../utils/deviceStatus";

/**
 * A repair status, everywhere one appears.
 *
 * The colour is carried by the dot, not by the text, and that is the whole
 * design. A pill filled with the status colour cannot hold a readable label —
 * white on the gold of `pending` is 3.1:1 and white on the teal of
 * `waiting_for_parts` is 3.0:1, both under the 4.5:1 a label needs — so a
 * filled pill would have forced the nine states down to the three or four
 * tones dark enough to write on. Tinting the pill instead and putting the ink
 * label on it keeps every state legible at full contrast, and the dot still
 * does the identifying.
 *
 * It also makes the list agree with the dashboard: the ring's legend is a
 * swatch beside ink text, and so is this.
 *
 * The tints are mixed toward `--surface` rather than written out, so one
 * definition serves both themes — on the dark theme the same 14% mix lands as
 * a dark tint of the same hue instead of a pastel.
 */
export default function DeviceStatusBadge({
  status,
  size = "md",
}: {
  status: string;
  /** `sm` for a table row, `md` for a card or a detail panel. */
  size?: "sm" | "md";
}) {
  const { label, color } = deviceStatusOf(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill font-bold whitespace-nowrap
                  border text-text-primary ${
                    size === "sm"
                      ? "px-2 py-0.5 text-body-xs"
                      : "px-2.5 py-1 text-body-xs"
                  }`}
      style={{
        backgroundColor: `color-mix(in oklab, ${color} 14%, var(--surface))`,
        borderColor: `color-mix(in oklab, ${color} 32%, var(--surface))`,
      }}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
