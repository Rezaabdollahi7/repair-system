import { useRef } from "react";
import { XMarkIcon, PrinterIcon } from "@heroicons/react/24/solid";
import { useReactToPrint } from "react-to-print";
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-surface rounded-lg w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
        dir="rtl"
      >
        <div className="flex items-center justify-between p-4 border-b border-border no-print">
          <h3 className="text-lg font-bold text-text-primary">رسید پرداخت</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-2 bg-primary text-text-inverse rounded-lg hover:bg-primary-hover flex items-center gap-1 text-sm"
            >
              <PrinterIcon className="w-4 h-4" />
              چاپ / PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-alt rounded-lg"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div ref={printRef} className="bg-surface p-6">
            <div className="border-b-2 border-border pb-4 mb-6 text-center">
              <h1 className="text-2xl font-bold text-primary">دوفیکسو</h1>
              <p className="text-sm text-text-secondary mt-1">
                سامانه مدیریت تعمیرگاه
              </p>
              <p className="text-sm text-text-secondary">dofixo.ir</p>
            </div>

            <h2 className="font-medium text-text-primary mb-3">
              رسید پرداخت اشتراک
            </h2>

            <table className="w-full text-sm">
              <tbody>
                <Row label="شماره سفارش" value={payment.order_id} mono />
                <Row label="تاریخ پرداخت" value={formatDate(payment.paid_at)} />
                <Row label="پلن" value={payment.plan_name} />
                {payment.ref_number && (
                  <Row label="شماره پیگیری" value={payment.ref_number} mono />
                )}
                {payment.card_number && (
                  <Row label="شماره کارت" value={payment.card_number} mono />
                )}
                {payment.created_by_name && (
                  <Row label="پرداخت‌کننده" value={payment.created_by_name} />
                )}
              </tbody>
            </table>

            <table className="w-full text-sm mt-6 border-t border-border pt-3">
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

            <div className="flex justify-between items-center mt-3 pt-3 border-t-2 border-border">
              <span className="font-bold text-text-primary">
                مبلغ پرداخت‌شده
              </span>
              <span className="font-bold text-primary text-lg">
                {toToman(payment.amount_rials)} تومان
              </span>
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
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <tr>
      <td className="py-1.5 text-text-secondary">{label}</td>
      <td
        className={`py-1.5 text-left text-text-primary ${mono ? "font-mono" : ""}`}
      >
        {value}
      </td>
    </tr>
  );
}
