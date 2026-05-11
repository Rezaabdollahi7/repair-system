// src/components/PurchaseInvoiceFormModal.jsx
import { useState, useEffect } from "react";
import { createPurchaseInvoice, getItems, createItem } from "../api";
import toast from "react-hot-toast";
import {
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  ShoppingCartIcon,
} from "@heroicons/react/24/solid";
import SearchableSelect from "./SearchableSelect";
import PersianDatePicker from "./PersianDatePicker";

function QuickItemModal({ isOpen, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    unit: "عدد",
    minStock: 0,
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.code?.trim()) newErrors.code = "کد کالا الزامی است";
    if (!formData.name?.trim()) newErrors.name = "نام کالا الزامی است";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await createItem(formData);
      toast.success("کالا با موفقیت تعریف شد");
      onSuccess(res.data);
      onClose();
      setFormData({ code: "", name: "", unit: "عدد", minStock: 0 });
    } catch (error) {
      toast.error(error.response?.data?.error || "خطا در تعریف کالا");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-2 sm:p-4">
      <div className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-md" dir="rtl">
        <h3 className="text-base sm:text-lg font-bold mb-3 sm:mb-4">
          تعریف سریع کالا
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-2 sm:space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                کد کالا *
              </label>
              <input
                name="code"
                value={formData.code}
                onChange={handleChange}
                className={`w-full border rounded px-3 py-2 text-sm ${errors.code ? "border-red-500" : "border-gray-300"}`}
              />
              {errors.code && (
                <p className="text-xs text-red-600 mt-1">{errors.code}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                نام کالا *
              </label>
              <input
                name="name"
                value={formData.name}
                onChange={handleChange}
                className={`w-full border rounded px-3 py-2 text-sm ${errors.name ? "border-red-500" : "border-gray-300"}`}
              />
              {errors.name && (
                <p className="text-xs text-red-600 mt-1">{errors.name}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">واحد</label>
              <select
                name="unit"
                value={formData.unit}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                <option value="عدد">عدد</option>
                <option value="متر">متر</option>
                <option value="کیلوگرم">کیلوگرم</option>
                <option value="بسته">بسته</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mt-4 sm:mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 order-2 sm:order-1"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 order-1 sm:order-2"
            >
              {loading ? "در حال ثبت..." : "ثبت"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PurchaseInvoiceFormModal({
  isOpen,
  onClose,
  onSuccess,
}) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [errors, setErrors] = useState({});
  const [showQuickModal, setShowQuickModal] = useState(false);

  const [formData, setFormData] = useState({
    supplier_name: "",
    invoice_date: new Date().toISOString().split("T")[0],
    paid_amount: 0,
    note: "",
  });

  const [selectedItems, setSelectedItems] = useState([]);

  const itemOptions = items.map((item) => ({
    value: item.id,
    label: `[${item.code}] ${item.name}`,
    subLabel: `موجودی: ${item.currentStock} ${item.unit} | میانگین قیمت: ${Number(item.avgPurchasePrice).toLocaleString()} ریال`,
    avgPrice: item.avgPurchasePrice,
    unit: item.unit,
  }));

  const fetchItems = async () => {
    setLoadingItems(true);
    try {
      const res = await getItems({ limit: 1000 });
      const itemsData = res.data?.data || res.data || [];
      setItems(Array.isArray(itemsData) ? itemsData : []);
    } catch {
      toast.error("خطا در دریافت لیست کالاها");
    } finally {
      setLoadingItems(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchItems();
  }, [isOpen]);

  const calculateItemTotal = (quantity, unitPrice) =>
    (quantity || 0) * (unitPrice || 0);
  const calculateSubtotal = () =>
    selectedItems.reduce(
      (sum, item) => sum + calculateItemTotal(item.quantity, item.unit_price),
      0,
    );
  const calculateTotal = () => calculateSubtotal();
  const calculateRemaining = () =>
    calculateTotal() - (formData.paid_amount || 0);

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? (value === "" ? 0 : Number(value)) : value,
    }));
  };

  const handleAddItem = () => {
    setSelectedItems((prev) => [
      ...prev,
      { item_id: "", quantity: 1, unit_price: 0 },
    ]);
  };

  const handleRemoveItem = (index) => {
    setSelectedItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index, field, value) => {
    setSelectedItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, [field]: value };
        if (field === "item_id" && value) {
          const selectedOption = itemOptions.find((opt) => opt.value === value);
          if (selectedOption && selectedOption.avgPrice > 0) {
            updated.unit_price = selectedOption.avgPrice;
          }
        }
        return updated;
      }),
    );
  };

  const validateForm = () => {
    const newErrors = {};
    if (selectedItems.length === 0)
      newErrors.items = "حداقل یک کالا باید انتخاب شود";
    selectedItems.forEach((item, index) => {
      if (!item.item_id) newErrors[`item_${index}`] = "کالا را انتخاب کنید";
      if (!item.quantity || item.quantity <= 0)
        newErrors[`quantity_${index}`] = "تعداد باید بیشتر از صفر باشد";
      if (!item.unit_price || item.unit_price < 0)
        newErrors[`price_${index}`] = "قیمت باید مثبت باشد";
    });
    if (formData.paid_amount < 0)
      newErrors.paid_amount = "مبلغ پرداختی نمی‌تواند منفی باشد";
    if (formData.paid_amount > calculateTotal())
      newErrors.paid_amount = "مبلغ پرداختی نمی‌تواند بیشتر از جمع کل باشد";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error("لطفاً خطاهای فرم را برطرف کنید");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        supplier_name: formData.supplier_name?.trim() || null,
        invoice_date: formData.invoice_date,
        paid_amount: formData.paid_amount,
        note: formData.note?.trim() || null,
        items: selectedItems.map((item) => ({
          item_id: parseInt(item.item_id),
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
      };
      await createPurchaseInvoice(payload);
      toast.success("فاکتور خرید با موفقیت ثبت شد");
      onSuccess && onSuccess();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error || "خطا در ثبت فاکتور");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => Number(amount).toLocaleString();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-6xl my-2 sm:my-8"
        dir="rtl"
      >
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl z-10">
          <h2 className="text-base sm:text-xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingCartIcon className="w-5 h-5 text-gray-600" />
            ثبت فاکتور خرید جدید
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-3 sm:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="lg:col-span-1 space-y-4 sm:space-y-6">
              <div className="bg-white shadow rounded-lg p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-medium text-gray-900 mb-3 sm:mb-4">
                  اطلاعات فاکتور
                </h2>
                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      نام فروشنده
                    </label>
                    <input
                      type="text"
                      name="supplier_name"
                      value={formData.supplier_name}
                      onChange={handleInputChange}
                      className="w-full border border-gray-300 rounded-lg px-3 sm:px-4 py-2 text-sm"
                      placeholder="مثلاً: فروشگاه قطعات الکترونیک"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      تاریخ فاکتور
                    </label>
                    <PersianDatePicker
                      value={formData.invoice_date}
                      onChange={(val) =>
                        setFormData((prev) => ({ ...prev, invoice_date: val }))
                      }
                      placeholder="انتخاب تاریخ"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      توضیحات
                    </label>
                    <textarea
                      name="note"
                      value={formData.note}
                      onChange={handleInputChange}
                      rows="3"
                      className="w-full border border-gray-300 rounded-lg px-3 sm:px-4 py-2 text-sm"
                      placeholder="توضیحات اضافی..."
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white shadow rounded-lg p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-medium text-gray-900 mb-3 sm:mb-4">
                  خلاصه پرداخت
                </h2>
                <div className="space-y-2 sm:space-y-3">
                  <div className="flex justify-between py-2 text-sm sm:text-base">
                    <span className="text-gray-600">جمع کل:</span>
                    <span className="font-medium">
                      {formatCurrency(calculateTotal())} ریال
                    </span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      مبلغ پرداختی
                    </label>
                    <input
                      type="number"
                      name="paid_amount"
                      value={formData.paid_amount}
                      onChange={handleInputChange}
                      min="0"
                      step="1000"
                      className={`w-full border rounded-lg px-3 sm:px-4 py-2 text-sm ${errors.paid_amount ? "border-red-500" : "border-gray-300"}`}
                    />
                    {errors.paid_amount && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors.paid_amount}
                      </p>
                    )}
                  </div>
                  <div className="flex justify-between py-2 border-t border-gray-200 text-sm sm:text-base">
                    <span className="text-gray-600">مانده:</span>
                    <span
                      className={`font-medium ${calculateRemaining() > 0 ? "text-red-600" : "text-green-600"}`}
                    >
                      {formatCurrency(calculateRemaining())} ریال
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-white shadow rounded-lg p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                  <h2 className="text-base sm:text-lg font-medium text-gray-900">
                    اقلام فاکتور
                  </h2>
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setShowQuickModal(true)}
                      className="bg-green-100 text-green-700 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg hover:bg-green-200 text-xs sm:text-sm flex items-center gap-1 flex-1 sm:flex-initial justify-center"
                    >
                      <PlusIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                      تعریف سریع کالا
                    </button>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="bg-blue-600 text-white px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg hover:bg-blue-700 text-xs sm:text-sm flex items-center gap-1 flex-1 sm:flex-initial justify-center"
                    >
                      <PlusIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                      افزودن کالا
                    </button>
                  </div>
                </div>

                {errors.items && (
                  <p className="mb-3 sm:mb-4 text-sm text-red-600">
                    {errors.items}
                  </p>
                )}

                {selectedItems.length === 0 ? (
                  <div className="text-center py-8 sm:py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                    <p>هیچ کالایی انتخاب نشده است</p>
                    <p className="text-xs sm:text-sm mt-1">
                      از دکمه "افزودن کالا" استفاده کنید
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 sm:space-y-4">
                    {selectedItems.map((item, index) => (
                      <div
                        key={index}
                        className="border border-gray-200 rounded-lg p-3 sm:p-4 bg-gray-50"
                      >
                        <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 sm:gap-3 items-center">
                          <div className="col-span-2 sm:col-span-5">
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              کالا <span className="text-red-500">*</span>
                            </label>
                            <SearchableSelect
                              options={itemOptions}
                              value={item.item_id}
                              onChange={(val) =>
                                handleItemChange(index, "item_id", val)
                              }
                              placeholder="جستجو و انتخاب کالا..."
                              loading={loadingItems}
                              required
                              error={errors[`item_${index}`]}
                            />
                          </div>
                          <div className="col-span-1 sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              تعداد <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) =>
                                handleItemChange(
                                  index,
                                  "quantity",
                                  parseInt(e.target.value) || 0,
                                )
                              }
                              min="1"
                              className={`w-full border rounded-lg px-1 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm ${errors[`quantity_${index}`] ? "border-red-500" : "border-gray-300"}`}
                            />
                            {errors[`quantity_${index}`] && (
                              <p className="mt-1 text-xs text-red-600">
                                {errors[`quantity_${index}`]}
                              </p>
                            )}
                          </div>
                          <div className="col-span-2 sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              قیمت واحد (ریال){" "}
                              <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              value={item.unit_price}
                              onChange={(e) =>
                                handleItemChange(
                                  index,
                                  "unit_price",
                                  parseInt(e.target.value) || 0,
                                )
                              }
                              min="0"
                              className={`w-full border rounded-lg px-1 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm ${errors[`price_${index}`] ? "border-red-500" : "border-gray-300"}`}
                            />
                            {errors[`price_${index}`] && (
                              <p className="mt-1 text-xs text-red-600">
                                {errors[`price_${index}`]}
                              </p>
                            )}
                          </div>
                          <div className="col-span-2 sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              جمع
                            </label>
                            <div className="px-1 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium bg-white border border-gray-200 rounded-lg">
                              {formatCurrency(
                                calculateItemTotal(
                                  item.quantity,
                                  item.unit_price,
                                ),
                              )}
                            </div>
                          </div>
                          <div className="col-span-1 sm:col-span-1">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(index)}
                              className="w-full px-2 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                            >
                              <TrashIcon className="w-3 h-3 sm:w-4 sm:h-4 mx-auto" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 order-2 sm:order-1"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 sm:px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 order-1 sm:order-2 justify-center"
            >
              {loading ? "در حال ثبت..." : "ثبت فاکتور"}
            </button>
          </div>
        </form>
      </div>

      <QuickItemModal
        isOpen={showQuickModal}
        onClose={() => setShowQuickModal(false)}
        onSuccess={() => {
          fetchItems();
          toast.success("کالا اضافه شد");
        }}
      />
    </div>
  );
}
