import StatusPill from "./StatusPill";
import { repairInvoiceStatusOf } from "../utils/invoiceStatus";

/** Where a repair invoice sits in its own lifecycle. */
export default function RepairInvoiceStatusBadge({
  status,
  size = "md",
}: {
  status: string;
  size?: "sm" | "md";
}) {
  const { label, color, tone } = repairInvoiceStatusOf(status);
  return <StatusPill label={label} color={color} tone={tone} size={size} />;
}
