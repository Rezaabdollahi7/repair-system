// src/pages/SaleInvoiceDetail.jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  getSaleInvoice,
  deleteSaleInvoice,
  updateSaleInvoicePayment,
} from "../api";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import {
  ArrowRightIcon,
  TrashIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/solid";

function PaymentStatusBadge({ status }) {
  const map = {
    paid: {
      label: "پرداخت شده",
      color: "bg-green-100 text-green-800",
      icon: CheckCircleIcon,
    },
    partial: {
      label: "پرداخت ناقص",
      color: "bg-yellow-100 text-yellow-800",
      icon: ExclamationCircleIcon,
    },
    pending: {
      label: "در انتظار",
      color: "bg-orange-100 text-orange-800",
      icon: ClockIcon,
    },
  };
  const s = map[status] || { label: status, color: "bg-gray-100" };
  const Icon = s.icon;
  return (
    <span
      className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 w-fit ${s.color}`}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {s.label}
    </span>
  );
}

function InfoRow({ label, value, highlight }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span
        className={`text-sm ${highlight ? "font-medium text-gray-900" : "text-gray-700"}`}
      >
        {value || "—"}
      </span>
    </div>
  );
}

export default function SaleInvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAtLeast } = useAuth();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [updatingPayment, setUpdatingPayment] = useState(false);

  useEffect(() => {
    fetchInvoice();
  }, [id]);

  const fetchInvoice = async () => {
    try {
      const res = await getSaleInvoice(id);
      setInvoice(res.data);
      setPaymentAmount(res.data.paid_amount || 0);
    } catch {
      toast.error("خطا در دریافت اطلاعات فاکتور");
      navigate("/sale-invoices");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `آیا از حذف فاکتور "${invoice?.invoice_number}" مطمئن هستید؟\nموجودی کالاها به حالت قبل برمی‌گردد.`,
      )
    )
      return;
    try {
      await deleteSaleInvoice(id);
      toast.success("فاکتور حذف شد");
      navigate("/sale-invoices");
    } catch {
      toast.error("خطا در حذف فاکتور");
    }
  };

  const handlePaymentUpdate = async () => {
    const newAmount = parseInt(paymentAmount);
    if (isNaN(newAmount) || newAmount < 0 || newAmount > invoice.total_amount) {
      toast.error("مبلغ پرداختی نامعتبر است");
      return;
    }
    setUpdatingPayment(true);
    try {
      await updateSaleInvoicePayment(id, { paid_amount: newAmount });
      toast.success("وضعیت پرداخت بروز شد");
      fetchInvoice();
    } catch {
      toast.error("خطا در بروزرسانی پرداخت");
    } finally {
      setUpdatingPayment(false);
    }
  };

  const formatCurrency = (val) => Number(val).toLocaleString();
  const formatDate = (date) =>
    date ? new Date(date).toLocaleDateString("fa-IR") : "—";

  if (loading) {
    return (
      <div className="text-center py-10 text-gray-500" dir="rtl">
        در حال بارگذاری...
      </div>
    );
  }
  if (!invoice) return null;

  const remaining = invoice.total_amount - invoice.paid_amount;

  return (
    <div dir="rtl" className="max-w-6xl mx-auto">
      <div className="mb-6">
        <Link
          to="/sale-invoices"
          className="text-gray-600 hover:text-gray-900 flex items-center gap-1 mb-2"
        >
          <ArrowRightIcon className="w-4 h-4" />
          بازگشت به لیست فاکتورهای فروش
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">فاکتور فروش</h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-lg font-mono text-gray-700">
                {invoice.invoice_number}
              </span>
              <PaymentStatusBadge status={invoice.payment_status} />
            </div>
          </div>
          <div className="flex gap-3">
            {isAtLeast("admin") && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
              >
                <TrashIcon className="w-4 h-4" />
                حذف فاکتور
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              اطلاعات فاکتور
            </h3>
            <div className="space-y-3">
              <InfoRow
                label="شماره فاکتور"
                value={invoice.invoice_number}
                highlight
              />
              <InfoRow label="مشتری" value={invoice.customer_name || "—"} />
              <InfoRow
                label="شماره تماس"
                value={invoice.customer_phone || "—"}
              />
              <InfoRow
                label="تاریخ فاکتور"
                value={formatDate(invoice.invoice_date)}
              />
              <InfoRow
                label="تاریخ ثبت"
                value={formatDate(invoice.created_at)}
              />
              {invoice.note && <InfoRow label="توضیحات" value={invoice.note} />}
            </div>
          </div>

          <div className="bg-white shadow rounded-lg p-6 mt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              وضعیت پرداخت
            </h3>
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">جمع کل:</span>
                  <span className="font-bold">
                    {formatCurrency(invoice.total_amount)} ریال
                  </span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">دریافت شده:</span>
                  <span className="text-green-600">
                    {formatCurrency(invoice.paid_amount)} ریال
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-200">
                  <span className="text-gray-600">مانده:</span>
                  <span
                    className={`font-bold ${remaining > 0 ? "text-red-600" : "text-green-600"}`}
                  >
                    {formatCurrency(remaining)} ریال
                  </span>
                </div>
              </div>

              {invoice.payment_status !== "paid" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    بروزرسانی پرداخت
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      max={invoice.total_amount}
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <button
                      onClick={handlePaymentUpdate}
                      disabled={updatingPayment}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {updatingPayment ? "..." : "ذخیره"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              اقلام فاکتور
            </h3>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                    کد
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                    نام کالا
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                    تعداد
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                    واحد
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                    قیمت واحد
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                    جمع
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {invoice.items?.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-sm font-mono">
                      {item.item_code}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Link
                        to={`/items/${item.item_id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {item.item_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm">{item.quantity}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {item.item_unit}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {formatCurrency(item.unit_price)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">
                      {formatCurrency(item.total_price)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-left font-medium">
                    جمع کل:
                  </td>
                  <td className="px-4 py-3 text-sm font-bold">
                    {formatCurrency(invoice.total_amount)} ریال
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
