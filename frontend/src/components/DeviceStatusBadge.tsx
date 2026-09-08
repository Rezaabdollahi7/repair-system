import StatusPill from "./StatusPill";
import { deviceStatusOf } from "../utils/deviceStatus";

/**
 * A repair status, everywhere one appears.
 *
 * Takes StatusPill's tint variant rather than a tone pair: these nine colours
 * are chart series slots, and a series colour is a mark, not text. White on
 * the gold of `pending` is 3.1:1, so the label wears ordinary ink and the dot
 * carries the identity — which is also how the dashboard's ring legend reads.
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
  return <StatusPill label={label} color={color} size={size} />;
}
