import { useRef } from "react";
import { useReactToPrint } from "react-to-print";
import PrintPreviewModal from "./PrintPreviewModal";
import type { SubscriptionPayment } from "../types/api";

interface PaymentReceiptProps {
  payment: SubscriptionPayment | null;
  isOpen: boolean;
  onClose: () => void;
}

/** Rials in the database, tomans on screen — as the subscription page does. */
function toToman(rials: number): string {
  return (rials / 10).toLocaleString("fa-IR");
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fa-IR") : "—";
}

/**
 * The receipt for one subscription payment.
 *
 * ⚠️ Deliberately does NOT use the workshop's letterhead, unlike
 * InvoicePreview. That component prints what a shop issues to its customer;
 * this one records what Dofixo issued to the shop, and putting their logo on
 * it would produce a receipt that reads as if they had billed themselves.
 *
 * No PDF library: the browser's print dialog offers Save as PDF, which is
 * the same result without a dependency — the pattern InvoicePreview already
 * established.
 */
export default function PaymentReceipt({
  payment,
  isOpen,
  onClose,
}: PaymentReceiptProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: payment ? `رسید-${payment.order_id}` : "رسید",
  });

  if (!isOpen || !payment) return null;

  return (
    <PrintPreviewModal
      title="رسید پرداخت"
      onPrint={handlePrint}
      onClose={onClose}
      maxWidth="32rem"
      showPdfButton={false}
    >
      <div
        ref={printRef}
        className="print-sheet bg-surface mx-auto max-w-[148mm] p-8 shadow-sm rounded-card"
      >
        <div className="avoid-break border-b-2 border-border-strong pb-4 mb-6 text-center">
          <h1 className="text-xl font-bold text-primary">دوفیکسو</h1>
          <p className="mt-1 text-xs text-text-secondary">
            سامانه مدیریت تعمیرگاه
          </p>
          <p className="text-xs text-text-secondary">dofixo.ir</p>
        </div>

        <h2 className="text-xs font-bold text-text-secondary mb-2">
          رسید پرداخت اشتراک
        </h2>

        <table className="w-full text-sm">
          <tbody>
            <Row label="شماره سفارش" value={payment.order_id} ltr />
            <Row label="تاریخ پرداخت" value={formatDate(payment.paid_at)} />
            <Row label="پلن" value={payment.plan_name} />
            {payment.ref_number && (
              <Row label="شماره پیگیری" value={payment.ref_number} ltr />
            )}
            {payment.card_number && (
              <Row label="شماره کارت" value={payment.card_number} ltr />
            )}
            {payment.created_by_name && (
              <Row label="پرداخت‌کننده" value={payment.created_by_name} />
            )}
          </tbody>
        </table>

        {/* The money, in its own block so the amount paid is not one more
            line in a list of metadata. */}
        <div className="avoid-break mt-6 rounded-card bg-surface-alt px-4 py-3">
          <table className="w-full text-sm">
            <tbody>
              <Row
                label="قیمت پلن"
                value={`${toToman(payment.base_price_rials)} تومان`}
              />
              {payment.discount_rials > 0 && (
                <Row
                  label="تخفیف"
                  value={`− ${toToman(payment.discount_rials)} تومان`}
                />
              )}
            </tbody>
          </table>

          <div className="flex justify-between items-center mt-2 pt-2.5 border-t border-border">
            <span className="font-bold text-text-primary">مبلغ پرداخت‌شده</span>
            <span className="text-base font-bold text-primary">
              {toToman(payment.amount_rials)} تومان
            </span>
          </div>
        </div>

        <p className="mt-8 text-xs text-text-secondary text-center">
          پرداخت از طریق درگاه امن زیبال انجام شده است.
        </p>
        {/* Said plainly rather than left to be discovered by someone who
            needs one for their accounts. */}
        <p className="mt-1 text-xs text-text-secondary text-center">
          این رسید فاکتور رسمی مالیاتی نیست.
        </p>
      </div>
    </PrintPreviewModal>
  );
}

/**
 * `ltr` replaces what used to be `mono`. Peyda has no monospace face, so the
 * class only ever picked whatever the browser had; what an order id or a
 * card number actually needs is a direction, because a Latin reference
 * inside an RTL sheet gets reordered around its separators.
 */
function Row({
  label,
  value,
  ltr,
}: {
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <tr>
      <td className="py-1.5 text-text-secondary">{label}</td>
      <td className="py-1.5 text-left text-text-primary font-medium">
        {ltr ? (
          <span dir="ltr" className="inline-block tracking-wide">
            {value}
          </span>
        ) : (
          value
        )}
      </td>
    </tr>
  );
}
