import StatusPill from "./StatusPill";
import { toPersianDigits } from "../utils/formatters";
import type { StockStatus } from "../utils/stockStatus";

/**
 * A stock state, with the quantity it applies to.
 *
 * The count rides along in the pill because on these pages they are one fact:
 * «کم‌موجود» alone tells a shop to act without telling it how urgently, and
 * the number used to sit in a column two cells away.
 *
 * Takes the tone variant — stock level is a severity, so the reserved
 * success/warning/danger pair applies and the label can wear the colour.
 */
export default function StockStatusBadge({
  status,
  quantity,
  unit,
  size = "md",
}: {
  status: StockStatus;
  quantity?: number;
  unit?: string;
  size?: "sm" | "md";
}) {
  /*
   * The count is dropped on the empty state: «اتمام موجودی ۰ عدد» says the
   * same thing twice, and zero is the one quantity the label already implies.
   */
  const extra =
    quantity !== undefined && status.key !== "out"
      ? `${toPersianDigits(quantity)}${unit ? ` ${unit}` : ""}`
      : undefined;

  return (
    <StatusPill
      label={status.label}
      color={status.color}
      tone={status.tone}
      extra={extra}
      size={size}
    />
  );
}
