import { toPersianDigits } from "../utils/formatters";
import type { StockStatus } from "../utils/stockStatus";

/**
 * A stock state, with the quantity it applies to.
 *
 * The badge carries the number as well as the label because on this page they
 * are one fact: «کم‌موجود» on its own tells a shop to act without telling it
 * how urgently, and the count used to sit in a separate column two cells
 * away. `quantity` is optional for the places that already print it — the
 * stock report has its own موجودی column.
 *
 * The tone classes come from the reserved semantic palette rather than a mixed
 * tint, unlike the repair-status badge: three states with fixed meanings can
 * afford real colour on the text, and `*-fg` steps are chosen to stay above
 * 4.5:1 on their own soft background.
 */
export default function StockStatusBadge({
  status,
  quantity,
  unit,
}: {
  status: StockStatus;
  quantity?: number;
  unit?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill
                  text-body-xs font-bold whitespace-nowrap ${status.tone}`}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: status.color }}
        aria-hidden="true"
      />
      {status.label}
      {/*
        The count is dropped on the empty state: «اتمام موجودی ۰ عدد» says the
        same thing twice, and the zero is the one quantity the label already
        implies.
      */}
      {quantity !== undefined && status.key !== "out" && (
        <span className="tabular-nums opacity-80">
          {toPersianDigits(quantity)}
          {unit ? ` ${unit}` : ""}
        </span>
      )}
    </span>
  );
}
