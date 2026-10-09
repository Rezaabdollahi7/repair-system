/**
 * One labelled fact inside a detail modal.
 *
 * There were five of these, four of them byte-identical. The odd one out was
 * the devices modal's, and it was the only correct one: the other four put
 * the label and the value in a `flex justify-between` row with nothing to
 * break it, so on a phone a long value — an address, a device fault written
 * out in a sentence — squeezed the label down to one word per line. This
 * stacks below `sm` and only pairs them across once there is room.
 */
export default function InfoRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: React.ReactNode;
  /** For the row that carries the number the reader came for. */
  highlight?: boolean;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 border-b border-border-subtle py-2.5
                 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
    >
      <span className="text-body-xs text-text-secondary sm:text-body-sm">
        {label}
      </span>
      {/*
        `min-w-0` with `break-words` rather than `truncate`: a phone number cut
        off mid-digit reads as a different number, so a long value wraps.
      */}
      <span
        className={`min-w-0 break-words text-body-sm sm:text-end ${
          highlight ? "font-bold text-text-primary" : "text-text-primary"
        }`}
      >
        {value || "—"}
      </span>
    </div>
  );
}
