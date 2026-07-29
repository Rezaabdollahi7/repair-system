// src/components/SaleInvoiceFormModal.jsx
import { useState, useEffect } from "react";
import {
  createSaleInvoice,
  updateSaleInvoice,
  getSaleInvoice,
  getItems,
  getCustomers,
  createCustomer,
  createItem,
  getDevice,
  searchCustomers,
} from "../api";
import toast from "react-hot-toast";
import {
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  UserPlusIcon,
  CurrencyDollarIcon,
  PencilSquareIcon,
  CubeIcon,
} from "@heroicons/react/24/solid";
import SearchableSelect from "./SearchableSelect";
import PersianDatePicker from "./PersianDatePicker";
import { formatPersianCurrency } from "../utils/formatters";
import ItemFormModal from "./ItemFormModal";

// واحدهای قابل انتخاب
const UNIT_OPTIONS = [
  { value: "عدد", label: "عدد" },
  { value: "متر", label: "متر" },
  { value: "کیلوگرم", label: "کیلوگرم" },
  { value: "بسته", label: "بسته" },
  { value: "کارتن", label: "کارتن" },
  { value: "لیتر", label: "لیتر" },
  { value: "دستگاه", label: "دستگاه" },
];

function QuickCustomerModal({ isOpen, onClose, onSuccess }) {
  const [formData, setFormData] = useState({ name: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.name?.trim()) newErrors.name = "نام مشتری الزامی است";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await createCustomer(formData);
      toast.success("مشتری با موفقیت ثبت شد");
      onSuccess(res.data);
      onClose();
      setFormData({ name: "", phone: "" });
    } catch {
      toast.error("خطا در ثبت مشتری");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-2 sm:p-4">
      <div
        className="bg-surface rounded-xl p-4 sm:p-6 w-full max-w-md"
        dir="rtl"
      >
        <h3 className="text-base sm:text-lg font-bold text-text-primary mb-3 sm:mb-4">
          ثبت سریع مشتری
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-2 sm:space-y-3">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                نام مشتری <span className="text-danger">*</span>
              </label>
              <input
                name="name"
                value={formData.name}
                onChange={handleChange}
                className={`w-full border rounded px-3 py-2 text-sm bg-surface text-text-primary ${errors.name ? "border-danger" : "border-border"}`}
                placeholder="مثلاً: علی احمدی"
              />
              {errors.name && (
                <p className="text-xs text-danger mt-1">{errors.name}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                شماره تماس
              </label>
              <input
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full border border-border rounded px-3 py-2 text-sm bg-surface text-text-primary"
                placeholder="مثلاً: ۰۹۱۲۳۴۵۶۷۸۹"
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mt-4 sm:mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border rounded hover:bg-surface-alt text-text-primary order-2 sm:order-1"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary text-text-inverse rounded hover:bg-primary-hover disabled:opacity-50 order-1 sm:order-2"
            >
              {loading ? "در حال ثبت..." : "ثبت"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SaleInvoiceFormModal({
  isOpen,
  onClose,
  onSuccess,
  deviceId,
  invoiceId,
}) {
  const isEditMode = Boolean(invoiceId);
  const [loading, setLoading] = useState(false);
  const [loadingDevice, setLoadingDevice] = useState(false);
  const [loadingInvoice, setLoadingInvoice] = useState(isEditMode);
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [errors, setErrors] = useState({});
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);

  const [formData, setFormData] = useState({
    customer_id: "",
    customer_name: "",
    customer_phone: "",
    invoice_date: new Date().toISOString().split("T")[0],
    paid_amount: 0,
    note: "",
  });

  const [selectedItems, setSelectedItems] = useState([]);

  const loadDeviceInfo = async (id) => {
    if (!id) return;
    setLoadingDevice(true);
    try {
      const res = await getDevice(id);
      const device = res.data;

      if (device) {
        const customerInfo = {
          customer_id: device.customer_id || "",
          customer_name: device.customer_name || "",
          customer_phone: device.customer_phone || "",
        };

        setFormData((prev) => ({
          ...prev,
          ...customerInfo,
        }));
      }
    } catch (error) {
      console.error("خطا در دریافت اطلاعات دستگاه:", error);
      toast.error("خطا در دریافت اطلاعات دستگاه");
    } finally {
      setLoadingDevice(false);
    }
  };

  const loadInvoiceData = async (id) => {
    if (!id) return;
    setLoadingInvoice(true);
    try {
      const res = await getSaleInvoice(id);
      const invoice = res.data;

      setFormData({
        customer_id: invoice.customer_id || "",
        customer_name: invoice.customer_name || "",
        customer_phone: invoice.customer_phone || "",
        invoice_date:
          invoice.invoice_date?.split("T")[0] ||
          new Date().toISOString().split("T")[0],
        paid_amount: invoice.paid_amount || 0,
        note: invoice.note || "",
        device_id: invoice.device_id || null,
      });

      if (invoice.device_id) {
        loadDeviceInfo(invoice.device_id);
      }

      const items = invoice.items.map((item) => ({
        item_type: item.item_id ? "inventory" : "custom",
        item_id: item.item_id || "",
        name: item.item_name || "",
        quantity: item.quantity || 1,
        unit: item.item_unit || "عدد",
        unit_price: item.unit_price || 0,
      }));
      setSelectedItems(items);
    } catch (error) {
      console.error("خطا در دریافت اطلاعات فاکتور:", error);
      toast.error("خطا در دریافت اطلاعات فاکتور");
      onClose();
    } finally {
      setLoadingInvoice(false);
    }
  };

  const handleCustomerSearch = async (query) => {
    if (!query || query.trim() === "") {
      try {
        const res = await getCustomers({ limit: 50 });
        setCustomers(res.data?.data || res.data || []);
      } catch {
        toast.error("خطا در دریافت لیست مشتریان");
      }
      return;
    }

    setSearchingCustomers(true);
    try {
      const res = await searchCustomers(query);
      setCustomers(res.data?.data || res.data || []);
    } catch (error) {
      console.error("خطا در جستجوی مشتری:", error);
      toast.error("خطا در جستجوی مشتری");
    } finally {
      setSearchingCustomers(false);
    }
  };

  const fetchData = async () => {
    setLoadingData(true);
    try {
      const [itemsRes, customersRes] = await Promise.all([
        getItems({ limit: 1000 }),
        getCustomers({ limit: 50 }),
      ]);
      setItems(itemsRes.data?.data || itemsRes.data || []);
      setCustomers(customersRes.data?.data || customersRes.data || []);
    } catch {
      toast.error("خطا در دریافت اطلاعات");
    } finally {
      setLoadingData(false);
    }
  };

  const refreshItems = async () => {
    try {
      const res = await getItems({ limit: 1000 });
      setItems(res.data?.data || res.data || []);
    } catch {
      toast.error("خطا در به‌روزرسانی لیست کالاها");
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchData();
      if (isEditMode && invoiceId) {
        loadInvoiceData(invoiceId);
      }
    }
  }, [isOpen, invoiceId, isEditMode]);

  useEffect(() => {
    if (isOpen && deviceId && !isEditMode) {
      loadDeviceInfo(deviceId);
    }
  }, [isOpen, deviceId, isEditMode]);

  useEffect(() => {
    if (isOpen && deviceId && !isEditMode) {
      setFormData((prev) => ({ ...prev, device_id: deviceId }));
    }
  }, [isOpen, deviceId, isEditMode]);

  const customerOptions = customers.map((c) => ({
    value: c.id,
    label: `${c.name} ${c.phone ? `- ${c.phone}` : ""}`,
    phone: c.phone,
    name: c.name,
  }));

  const itemOptions = items.map((item) => ({
    value: item.id,
    label: `[${item.code}] ${item.name}`,
    subLabel: `موجودی: ${item.currentStock} ${item.unit} | میانگین قیمت خرید: ${Number(item.avgPurchasePrice || 0).toLocaleString()} ریال`,
    stock: item.currentStock,
    unit: item.unit,
    avgPrice: item.avgPurchasePrice || 0,
  }));

  const calculateItemTotal = (qty, price) => (qty || 0) * (price || 0);
  const calculateTotal = () =>
    selectedItems.reduce(
      (sum, item) => sum + calculateItemTotal(item.quantity, item.unit_price),
      0,
    );
  const calculateRemaining = () =>
    calculateTotal() - (formData.paid_amount || 0);

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? (value === "" ? 0 : Number(value)) : value,
    }));
  };

  const handleCustomerSelect = (customerId) => {
    const customer = customers.find((c) => c.id === customerId);
    if (customer)
      setFormData((prev) => ({
        ...prev,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_phone: customer.phone || "",
      }));
  };

  const handleAddItem = (type) => {
    if (type === "inventory") {
      setSelectedItems((prev) => [
        ...prev,
        {
          item_type: "inventory",
          item_id: "",
          name: "",
          quantity: 1,
          unit: "عدد",
          unit_price: 0,
        },
      ]);
    } else {
      setSelectedItems((prev) => [
        ...prev,
        {
          item_type: "custom",
          name: "",
          quantity: 1,
          unit: "عدد",
          unit_price: 0,
        },
      ]);
    }
  };
  const handleRemoveItem = (index) =>
    setSelectedItems((prev) => prev.filter((_, i) => i !== index));

  const handleItemChange = (index, field, value) => {
    setSelectedItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, [field]: value };
        if (field === "item_id" && value) {
          const selectedItem = items.find((it) => it.id === value);
          if (selectedItem)
            updated.unit_price = Math.round(
              (selectedItem.avgPurchasePrice || 0) * 1.2,
            );
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
      if (item.item_type === "inventory" && !item.item_id) {
        newErrors[`item_${index}`] = "کالا را انتخاب کنید";
      }

      if (item.item_type === "custom" && !item.name?.trim()) {
        newErrors[`item_${index}`] = "نام آیتم را وارد کنید";
      }

      if (item.item_type === "inventory") {
        const selectedItem = items.find((it) => it.id === item.item_id);
        if (selectedItem && item.quantity > selectedItem.currentStock)
          newErrors[`quantity_${index}`] =
            `موجودی کافی نیست (موجودی: ${selectedItem.currentStock})`;
      }

      if (!item.quantity || item.quantity <= 0)
        newErrors[`quantity_${index}`] = "تعداد باید بیشتر از صفر باشد";
      if (!item.unit_price || item.unit_price < 0)
        newErrors[`price_${index}`] = "قیمت باید مثبت باشد";
    });

    if (formData.paid_amount < 0)
      newErrors.paid_amount = "مبلغ پرداختی نمی‌تواند منفی باشد";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const resetForm = () => {
    setFormData({
      customer_id: "",
      customer_name: "",
      customer_phone: "",
      invoice_date: new Date().toISOString().split("T")[0],
      paid_amount: 0,
      note: "",
    });
    setSelectedItems([]);
    setErrors({});
  };

  const handleModalClose = () => {
    resetForm();
    onClose();
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
        customer_id: formData.customer_id || null,
        device_id: formData.device_id || deviceId || null,
        customer_name: formData.customer_name?.trim() || "مشتری متفرقه",
        customer_phone: formData.customer_phone?.trim() || null,
        invoice_date: formData.invoice_date,
        paid_amount: formData.paid_amount,
        note: formData.note?.trim() || null,
        items: selectedItems.map((item) => ({
          item_type: item.item_type || "inventory",
          item_id:
            item.item_type === "inventory" ? parseInt(item.item_id) : null,
          name: item.item_type === "inventory" ? item.name || "" : item.name,
          quantity: item.quantity,
          unit: item.unit || "عدد",
          unit_price: item.unit_price,
        })),
      };

      if (isEditMode) {
        await updateSaleInvoice(invoiceId, payload);
        toast.success("فاکتور فروش با موفقیت ویرایش شد");
      } else {
        await createSaleInvoice(payload);
        toast.success("فاکتور فروش با موفقیت ثبت شد");
      }

      resetForm();
      onSuccess && onSuccess();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error || "خطا در ثبت فاکتور");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  if (loadingInvoice) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-surface rounded-xl p-8">
          <div className="text-center py-4 text-text-primary" dir="rtl">
            در حال بارگذاری فاکتور...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div
        className="bg-surface rounded-xl shadow-xl w-full max-w-7xl my-2 sm:my-8"
        dir="rtl"
      >
        {/* هدر مودال */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-border sticky top-0 bg-surface rounded-t-xl z-10">
          <h2 className="text-lg sm:text-xl font-bold text-text-primary flex items-center gap-2">
            <CurrencyDollarIcon className="w-5 h-5 text-text-secondary" />
            {isEditMode ? "ویرایش فاکتور فروش" : "ثبت فاکتور فروش جدید"}
            {loadingDevice && (
              <span className="text-xs text-text-secondary mr-2">
                (در حال بارگذاری اطلاعات دستگاه...)
              </span>
            )}
          </h2>
          <button
            onClick={handleModalClose}
            className="p-1 text-text-secondary hover:text-text-primary hover:bg-surface-alt rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 sm:p-6">
          <form onSubmit={handleSubmit}>
            {/* ===== بخش اطلاعات مشتری (افقی) ===== */}
            <div className="bg-surface shadow rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
              <h2 className="text-base sm:text-lg font-medium text-text-primary mb-4 flex items-center gap-2">
                <UserPlusIcon className="w-5 h-5 text-text-secondary" />
                اطلاعات مشتری
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {/* انتخاب مشتری */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">
                    انتخاب مشتری
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <SearchableSelect
                        options={customerOptions}
                        value={formData.customer_id}
                        onChange={handleCustomerSelect}
                        onSearch={handleCustomerSearch}
                        onOpen={() => handleCustomerSearch("")}
                        placeholder="جستجو و انتخاب مشتری..."
                        loading={searchingCustomers}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCustomerModal(true)}
                      className="px-3 py-2 bg-success-soft text-success rounded-lg hover:bg-success-soft shrink-0"
                      title="ثبت سریع مشتری"
                    >
                      <UserPlusIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                </div>

                {/* نام مشتری */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">
                    نام مشتری
                  </label>
                  <input
                    type="text"
                    name="customer_name"
                    value={formData.customer_name}
                    onChange={handleInputChange}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text-primary"
                    placeholder="مشتری متفرقه"
                  />
                </div>

                {/* شماره تماس */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">
                    شماره تماس
                  </label>
                  <input
                    type="tel"
                    name="customer_phone"
                    value={formData.customer_phone}
                    onChange={handleInputChange}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text-primary"
                    placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                  />
                </div>

                {/* تاریخ فاکتور */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">
                    تاریخ فاکتور
                  </label>
                  <PersianDatePicker
                    value={formData.invoice_date}
                    onChange={(val) =>
                      setFormData((prev) => ({
                        ...prev,
                        invoice_date: val,
                      }))
                    }
                    placeholder="انتخاب تاریخ"
                  />
                </div>
              </div>

              {/* توضیحات در پایین بخش اطلاعات مشتری */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  توضیحات
                </label>
                <textarea
                  name="note"
                  value={formData.note}
                  onChange={handleInputChange}
                  rows="2"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text-primary"
                  placeholder="توضیحات اضافی..."
                />
              </div>
            </div>

            {/* ===== گرید اصلی: اقلام فاکتور (9/12) + خلاصه پرداخت (3/12) ===== */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
              {/* ستون چپ - اقلام فاکتور (9/12) */}
              <div className="lg:col-span-9">
                <div className="bg-surface shadow rounded-lg p-3 sm:p-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3 sm:mb-4">
                    <h2 className="text-base sm:text-lg font-medium text-text-primary flex items-center gap-2">
                      <CubeIcon className="w-5 h-5 text-text-secondary" />
                      اقلام فاکتور
                    </h2>

                    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setShowItemModal(true)}
                        className="bg-success-soft text-success px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg hover:bg-success-soft text-xs sm:text-sm flex items-center gap-1 flex-1 sm:flex-initial justify-center"
                      >
                        <PlusIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                        تعریف کالای جدید
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddItem("inventory")}
                        className="bg-primary-soft text-primary px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg hover:bg-primary-soft text-xs sm:text-sm flex items-center gap-1 flex-1 sm:flex-initial justify-center"
                      >
                        <PlusIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                        از انبار
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddItem("custom")}
                        className="bg-primary-soft text-primary px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg hover:bg-primary-soft text-xs sm:text-sm flex items-center gap-1 flex-1 sm:flex-initial justify-center"
                      >
                        <PencilSquareIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                        دلخواه
                      </button>
                    </div>
                  </div>

                  {errors.items && (
                    <p className="text-sm text-danger mb-3 sm:mb-4">
                      {errors.items}
                    </p>
                  )}

                  {selectedItems.length === 0 ? (
                    <div className="text-center py-8 sm:py-10 text-text-secondary border-2 border-dashed border-border rounded-lg">
                      <p>هیچ کالایی انتخاب نشده است</p>
                      <p className="text-xs sm:text-sm mt-1">
                        از دکمه‌های بالا برای افزودن کالا استفاده کنید
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 sm:space-y-4">
                      {selectedItems.map((item, index) => {
                        const selectedItem = items.find(
                          (it) => it.id === item.item_id,
                        );
                        return (
                          <div
                            key={index}
                            className="border border-border rounded-lg p-3 sm:p-4 bg-surface-alt"
                          >
                            <div className="grid grid-cols-12 gap-2 items-center">
                              {/* نوع آیتم */}
                              <div className="col-span-1">
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary-soft text-primary whitespace-nowrap">
                                  {item.item_type === "inventory"
                                    ? "انبار"
                                    : "دلخواه"}
                                </span>
                              </div>

                              {/* شرح / انتخاب کالا */}
                              <div className="col-span-4">
                                {item.item_type === "inventory" ? (
                                  <>
                                    <label className="block text-[13px] font-medium text-text-secondary mb-0.5">
                                      نام کالا
                                    </label>
                                    <SearchableSelect
                                      options={itemOptions}
                                      value={item.item_id}
                                      onChange={(val) =>
                                        handleItemChange(index, "item_id", val)
                                      }
                                      placeholder="جستجوی کالا..."
                                      loading={loadingData}
                                      error={errors[`item_${index}`]}
                                    />
                                  </>
                                ) : (
                                  <>
                                    <label className="block text-[13px] font-medium text-text-secondary mb-0.5">
                                      نام کالا
                                    </label>
                                    <input
                                      type="text"
                                      value={item.name}
                                      onChange={(e) =>
                                        handleItemChange(
                                          index,
                                          "name",
                                          e.target.value,
                                        )
                                      }
                                      placeholder="نام آیتم دلخواه"
                                      className="w-full border border-border rounded px-2 py-1.5 text-xs sm:text-sm bg-surface text-text-primary"
                                    />
                                  </>
                                )}
                                {selectedItem && (
                                  <p className="mt-0.5 text-[10px] text-text-secondary">
                                    موجودی: {selectedItem.currentStock}{" "}
                                    {selectedItem.unit}
                                  </p>
                                )}
                              </div>

                              {/* تعداد - کوچک‌تر */}
                              <div className="col-span-1">
                                <label className="block text-[13px] font-medium text-text-secondary mb-0.5">
                                  تعداد
                                </label>
                                <input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) =>
                                    handleItemChange(
                                      index,
                                      "quantity",
                                      parseInt(e.target.value) || 1,
                                    )
                                  }
                                  min="1"
                                  step="1"
                                  max={selectedItem?.currentStock}
                                  className="w-full border border-border rounded px-1 py-1.5 text-xs sm:text-sm bg-surface text-text-primary"
                                />
                                <p className="mt-0.5 text-[10px] text-text-secondary opacity-0">
                                  white space
                                </p>
                                {errors[`quantity_${index}`] && (
                                  <p className="text-[10px] text-danger mt-0.5">
                                    {errors[`quantity_${index}`]}
                                  </p>
                                )}
                              </div>

                              {/* واحد - به صورت دراپ‌داون */}
                              <div className="col-span-1">
                                <label className="block text-[13px] font-medium text-text-secondary mb-0.5">
                                  واحد
                                </label>
                                <select
                                  value={item.unit}
                                  onChange={(e) =>
                                    handleItemChange(
                                      index,
                                      "unit",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full border border-border rounded px-1 py-1.5 text-xs sm:text-sm bg-surface text-text-primary"
                                >
                                  {UNIT_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                                <p className="mt-0.5 text-[10px] text-text-secondary opacity-0">
                                  white space
                                </p>
                              </div>

                              {/* قیمت واحد */}
                              <div className="col-span-2">
                                <label className="block text-[13px] font-medium text-text-secondary mb-0.5">
                                  قیمت واحد (ریال)
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
                                  step="1000"
                                  className="w-full border border-border rounded px-1 py-1.5 text-xs sm:text-sm bg-surface text-text-primary"
                                />
                                <p className="mt-0.5 text-[10px] text-text-secondary opacity-0">
                                  white space
                                </p>
                                {errors[`price_${index}`] && (
                                  <p className="text-[10px] text-danger mt-0.5">
                                    {errors[`price_${index}`]}
                                  </p>
                                )}
                              </div>

                              {/* جمع - بزرگ‌تر */}
                              <div className="col-span-2">
                                <label className="block text-[13px] font-medium text-text-secondary mb-0.5">
                                  جمع (ریال)
                                </label>
                                <div className="w-full px-1 py-1.5 text-xs sm:text-sm font-medium bg-surface border border-border rounded text-left text-text-primary">
                                  {formatPersianCurrency(
                                    calculateItemTotal(
                                      item.quantity,
                                      item.unit_price,
                                    ),
                                  )}
                                </div>
                                <p className="mt-0.5 text-[10px] text-text-secondary opacity-0">
                                  white space
                                </p>
                              </div>

                              {/* دکمه حذف */}
                              <div className="col-span-1 mt-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(index)}
                                  className="text-danger hover:text-danger p-1"
                                >
                                  <TrashIcon className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* ستون راست - خلاصه پرداخت (3/12) */}
              <div className="lg:col-span-3">
                <div className="bg-surface shadow rounded-lg p-4 sm:p-6 sticky top-24">
                  <h2 className="text-base sm:text-lg font-medium text-text-primary mb-4">
                    خلاصه پرداخت
                  </h2>

                  <div className="space-y-3">
                    <div className="flex justify-between py-2 text-sm sm:text-base border-b border-border">
                      <span className="text-text-secondary">
                        جمع کل (ریال):
                      </span>
                      <span className="font-medium text-text-primary">
                        {formatPersianCurrency(calculateTotal())}
                      </span>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1.5">
                        مبلغ دریافتی (ریال)
                      </label>
                      <input
                        type="number"
                        name="paid_amount"
                        value={formData.paid_amount}
                        onChange={handleInputChange}
                        min="0"
                        step="1000"
                        className={`w-full border rounded-lg px-3 py-2 text-sm bg-surface text-text-primary ${errors.paid_amount ? "border-danger" : "border-border"}`}
                      />
                      {errors.paid_amount && (
                        <p className="mt-1 text-xs text-danger">
                          {errors.paid_amount}
                        </p>
                      )}
                    </div>

                    <div className="flex justify-between py-2 border-t border-border text-sm sm:text-base font-bold">
                      <span className="text-text-primary">مانده (ریال):</span>
                      <span
                        className={`${calculateRemaining() > 0 ? "text-danger" : "text-success"}`}
                      >
                        {formatPersianCurrency(calculateRemaining())}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ===== دکمه‌های اقدام ===== */}
            <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
              <button
                type="button"
                onClick={handleModalClose}
                className="px-3 sm:px-4 py-2 border border-border rounded-lg hover:bg-surface-alt text-text-primary text-sm sm:text-base order-2 sm:order-1"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 sm:px-6 py-2 bg-primary text-text-inverse rounded-lg hover:bg-primary-hover disabled:opacity-50 text-sm sm:text-base order-1 sm:order-2"
              >
                {loading
                  ? "در حال ثبت..."
                  : isEditMode
                    ? "ویرایش فاکتور"
                    : "ثبت فاکتور فروش"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* مودال ثبت سریع مشتری */}
      <QuickCustomerModal
        isOpen={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        onSuccess={(newCustomer) => {
          setCustomers((prev) => [newCustomer, ...prev]);
          handleCustomerSelect(newCustomer.id);
        }}
      />

      {/* مودال ثبت کالا */}
      <ItemFormModal
        isOpen={showItemModal}
        onClose={() => setShowItemModal(false)}
        onSuccess={() => {
          refreshItems();
          toast.success("کالا اضافه شد و در لیست موجود است");
        }}
      />
    </div>
  );
}
