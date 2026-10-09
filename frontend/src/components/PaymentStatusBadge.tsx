import StatusPill from "./StatusPill";
import { paymentStatusOf } from "../utils/invoiceStatus";

/** Payment progress on an invoice of any kind. */
export default function PaymentStatusBadge({
  status,
  size = "md",
}: {
  status: string;
  size?: "sm" | "md";
}) {
  const { label, color, tone } = paymentStatusOf(status);
  return <StatusPill label={label} color={color} tone={tone} size={size} />;
}
