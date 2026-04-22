// src/pages/RepairInvoiceForm.jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  createRepairInvoice,
  updateRepairInvoice,
  getRepairInvoice,
  searchDevicesForInvoice,
  searchItemsForInvoice,
  getServices,
  getTechnicians,
  getSettings,
  createCustomer,
} from "../api";
import toast from "react-hot-toast";
import {
  ArrowRightIcon,
  PlusIcon,
  TrashIcon,
  CubeIcon,
  WrenchScrewdriverIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/solid";
import SearchableSelect from "../components/SearchableSelect";
import PersianDatePicker from "../components/PersianDatePicker";

export default function RepairInvoiceForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditMode);
  const [settings, setSettings] = useState(null);

  function QuickCustomerModal({ isOpen, onClose, onSuccess }) {
    const [formData, setFormData] = useState({ name: "", phone: "" });
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
      e.preventDefault();
      if (!formData.name.trim()) {
        toast.error("نام مشتری الزامی است");
        return;
      }
      setLoading(true);
      try {
        const res = await createCustomer(formData);
        toast.success("مشتری با موفقیت ثبت شد");
        onSuccess(res.data);
        onClose();
      } catch {
        toast.error("خطا در ثبت مشتری");
      } finally {
        setLoading(false);
      }
    };

    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-md" dir="rtl">
          <h3 className="text-lg font-bold mb-4">ثبت سریع مشتری</h3>
          <form onSubmit={handleSubmit}>
            <div className="space-y-3">
              <label className="block text-sm font-medium mb-2">
                نام مشتری
              </label>
              <input
                type="text"
                name="customer_name"
                value={formData.customer_name}
                readOnly
                className="w-full border border-gray-300 rounded-lg px-4 py-2 bg-gray-50 text-gray-700"
              />
              <label className="block text-sm font-medium mb-2">
                شماره تماس
              </label>
              <input
                type="tel"
                name="customer_phone"
                value={formData.customer_phone}
                readOnly
                className="w-full border border-gray-300 rounded-lg px-4 py-2 bg-gray-50 text-gray-700"
              />
            </div>
            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                {loading ? "..." : "ثبت"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
  // Form state
  const [formData, setFormData] = useState({
    device_id: "",
    customer_name: "",
    customer_id: "",
    customer_phone: "",
    invoice_date: new Date().toISOString().split("T")[0],
    technician_id: "",
    warranty_months: 3,
    tax_rate: 9,
    discount_type: "",
    discount_value: 0,
    notes: "",
  });

  const [selectedItems, setSelectedItems] = useState([]);
  const [errors, setErrors] = useState({});

  // Data for dropdowns
  const [devices, setDevices] = useState([]);
  const [items, setItems] = useState([]);
  const [services, setServices] = useState([]);
  const [technicians, setTechnicians] = useState([]);

  // ─── Fetch Settings & Data ─────────────────────────────────
  useEffect(() => {
    // Get default tax rate from settings
    getSettings()
      .then((res) => {
        setSettings(res.data);
        setFormData((prev) => ({
          ...prev,
          tax_rate: res.data.default_tax_rate || 9,
          warranty_months: res.data.default_warranty_months || 3,
        }));
      })
      .catch(() => {});

    // Load services and technicians
    Promise.all([getServices(), getTechnicians()])
      .then(([servicesRes, techRes]) => {
        setServices(servicesRes.data || []);
        setTechnicians(techRes.data?.data || techRes.data || []);
      })
      .catch(() => {});
  }, []);

  // Load invoice data in edit mode
  useEffect(() => {
    if (isEditMode) {
      getRepairInvoice(id)
        .then((res) => {
          const invoice = res.data;
          setFormData({
            device_id: invoice.device_id,
            customer_name: invoice.customer_name || "",
            customer_phone: invoice.customer_phone || "",
            invoice_date:
              invoice.invoice_date?.split("T")[0] ||
              new Date().toISOString().split("T")[0],
            technician_id: invoice.technician_id || "",
            warranty_months: invoice.warranty_months || 3,
            tax_rate: invoice.tax_rate || 9,
            discount_type: invoice.discount_type || "",
            discount_value: invoice.discount_value || 0,
            notes: invoice.notes || "",
          });

          // Transform items
          const items = invoice.items.map((item) => ({
            item_type: item.item_type,
            item_id: item.item_id || "",
            name: item.name,
            quantity: item.quantity,
            unit: item.unit || "عدد",
            unit_price: item.unit_price,
            discount_type: item.discount_type || "",
            discount_value: item.discount_value || 0,
          }));
          setSelectedItems(items);

          // Load device info
          if (invoice.device_id) {
            searchDevicesForInvoice("").then((res) => {
              const device = res.data?.data?.find(
                (d) => d.id === invoice.device_id,
              );
              if (device) setDevices([device]);
            });
          }
        })
        .catch(() => {
          toast.error("خطا در دریافت اطلاعات فاکتور");
          navigate("/repair-invoices");
        })
        .finally(() => setInitialLoading(false));
    }
  }, [id, isEditMode, navigate]);

  // ─── Device Options for SearchableSelect ─────────────────
  const deviceOptions = devices.map((d) => ({
    value: d.id,
    label: `${d.id} - ${d.device_name} ${d.brand ? `(${d.brand})` : ""}`,
    subLabel: `مشتری: ${d.customer_name || "—"} | مدل: ${d.model || "—"} | تلفن: ${d.customer_phone || "—"}`,
    customer_name: d.customer_name,
    customer_phone: d.customer_phone,
  }));

  // Item options
  const itemOptions = items.map((i) => ({
    value: i.id,
    label: `[${i.code}] ${i.name}`,
    subLabel: `موجودی: ${i.current_stock} ${i.unit} | قیمت فروش: ${Number(i.sell_price || 0).toLocaleString()} ریال`,
    sell_price: i.sell_price,
    unit: i.unit,
  }));

  // Technician options
  const technicianOptions = technicians.map((t) => ({
    value: t.id,
    label: t.full_name || t.name || t.username,
  }));

  // ─── Calculations ─────────────────────────────────────────
  const calculateItemTotal = (item) => {
    const subtotal = item.quantity * item.unit_price;
    let discount = 0;
    if (item.discount_type === "percentage") {
      discount = subtotal * (item.discount_value / 100);
    } else if (item.discount_type === "fixed") {
      discount = item.discount_value;
    }
    return subtotal - discount;
  };

  const calculateSubtotal = () => {
    return selectedItems.reduce(
      (sum, item) => sum + calculateItemTotal(item),
      0,
    );
  };

  const calculateDiscount = () => {
    const subtotal = calculateSubtotal();
    if (formData.discount_type === "percentage") {
      return subtotal * (formData.discount_value / 100);
    } else if (formData.discount_type === "fixed") {
      return formData.discount_value;
    }
    return 0;
  };

  const calculateTax = () => {
    const afterDiscount = calculateSubtotal() - calculateDiscount();
    return afterDiscount * (formData.tax_rate / 100);
  };

  const calculateTotal = () => {
    return calculateSubtotal() - calculateDiscount() + calculateTax();
  };

  // ─── Handlers ─────────────────────────────────────────────
  const handleDeviceSearch = async (query) => {
    try {
      const res = await searchDevicesForInvoice(query || "");
      setDevices(res.data?.data || res.data || []);
    } catch {
      toast.error("خطا در جستجوی دستگاه");
    }
  };

  const handleItemSearch = async (query) => {
    try {
      const res = await searchItemsForInvoice(query || "");
      setItems(res.data || []);
    } catch {
      toast.error("خطا در جستجوی کالا");
    }
  };

  const handleDeviceSelect = (deviceId) => {
    const device = devices.find((d) => d.id === deviceId);
    if (device) {
      setFormData((prev) => ({
        ...prev,
        device_id: deviceId,
        customer_id: device.customer_id || null,
        customer_name: device.customer_name || "",
        customer_phone: device.customer_phone || "",
      }));
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? (value === "" ? 0 : Number(value)) : value,
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
          discount_type: "",
          discount_value: 0,
        },
      ]);
    } else if (type === "service") {
      setSelectedItems((prev) => [
        ...prev,
        {
          item_type: "service",
          name: "",
          quantity: 1,
          unit: "خدمت",
          unit_price: 0,
          discount_type: "",
          discount_value: 0,
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
          discount_type: "",
          discount_value: 0,
        },
      ]);
    }
  };

  const handleRemoveItem = (index) => {
    setSelectedItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index, field, value) => {
    setSelectedItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, [field]: value };

        // Auto-fill for inventory items
        if (field === "item_id" && item.item_type === "inventory" && value) {
          const selectedItem = items.find((it) => it.id === value);
          if (selectedItem) {
            updated.name = selectedItem.name;
            updated.unit = selectedItem.unit;
            updated.unit_price = selectedItem.sell_price || 0;
          }
        }

        // Auto-fill for service items
        if (field === "name" && item.item_type === "service" && value) {
          const selectedService = services.find(
            (s) => s.name === value || s.id === value,
          );
          if (selectedService) {
            updated.unit_price = selectedService.default_price || 0;
            updated.unit = selectedService.unit || "خدمت";
          }
        }

        return updated;
      }),
    );
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.device_id) {
      newErrors.device_id = "دستگاه باید انتخاب شود";
    }

    if (selectedItems.length === 0) {
      newErrors.items = "حداقل یک آیتم باید اضافه شود";
    }

    selectedItems.forEach((item, index) => {
      if (!item.name?.trim()) {
        newErrors[`item_${index}_name`] = "نام آیتم الزامی است";
      }
      if (!item.quantity || item.quantity <= 0) {
        newErrors[`item_${index}_quantity`] = "تعداد باید بیشتر از صفر باشد";
      }
      if (
        item.item_type === "inventory" &&
        item.quantity >
          (items.find((i) => i.id === item.item_id)?.current_stock || 0)
      ) {
        newErrors[`item_${index}_quantity`] = "موجودی کافی نیست";
      }
    });

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
        device_id: formData.device_id,
        customer_name: formData.customer_name,
        customer_phone: formData.customer_phone,
        invoice_date: formData.invoice_date,
        technician_id: formData.technician_id || null,
        warranty_months: formData.warranty_months,
        tax_rate: formData.tax_rate,
        discount_type: formData.discount_type || null,
        discount_value: formData.discount_value,
        notes: formData.notes,
        items: selectedItems.map((item) => ({
          item_type: item.item_type,
          item_id: item.item_id || null,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          discount_type: item.discount_type || null,
          discount_value: item.discount_value,
        })),
      };

      if (isEditMode) {
        await updateRepairInvoice(id, payload);
        toast.success("فاکتور با موفقیت ویرایش شد");
      } else {
        await createRepairInvoice(payload);
        toast.success("فاکتور با موفقیت ایجاد شد");
      }
      navigate("/repair-invoices");
    } catch (error) {
      toast.error(error.response?.data?.error || "خطا در ذخیره فاکتور");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => Number(amount).toLocaleString();

  if (initialLoading) {
    return (
      <div className="text-center py-10" dir="rtl">
        در حال بارگذاری...
      </div>
    );
  }

  return (
    <div dir="rtl" className="max-w-7xl mx-auto">
      <div className="mb-6">
        <Link
          to="/repair-invoices"
          className="text-gray-600 hover:text-gray-900 flex items-center gap-1 mb-2"
        >
          <ArrowRightIcon className="w-4 h-4" />
          بازگشت به لیست فاکتورها
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditMode ? "ویرایش فاکتور تعمیر" : "ثبت فاکتور تعمیر جدید"}
        </h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Info */}
          <div className="lg:col-span-1 space-y-6">
            {/* Device Selection */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                <WrenchScrewdriverIcon className="w-5 h-5 text-gray-600" />
                اطلاعات دستگاه
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    انتخاب دستگاه <span className="text-red-500">*</span>
                  </label>
                  <SearchableSelect
                    options={deviceOptions}
                    value={formData.device_id}
                    onChange={handleDeviceSelect}
                    onSearch={handleDeviceSearch}
                    onOpen={() => handleDeviceSearch("")}
                    placeholder="جستجو و انتخاب دستگاه..."
                    error={errors.device_id}
                    required
                  />
                </div>
                {formData.device_id && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        نام مشتری
                      </label>
                      <input
                        type="text"
                        value={formData.customer_name || "—"}
                        readOnly
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 bg-gray-100 text-gray-700"
                      />
                      {!formData.customer_name && (
                        <p className="text-yellow-600 text-xs mt-1">
                          ⚠️ این دستگاه مشتری ثبت شده ندارد.
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        شماره تماس
                      </label>
                      <input
                        type="tel"
                        value={formData.customer_phone || "—"}
                        readOnly
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 bg-gray-100 text-gray-700"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Invoice Details */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                جزئیات فاکتور
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    تاریخ فاکتور
                  </label>
                  <PersianDatePicker
                    value={formData.invoice_date}
                    onChange={(val) =>
                      setFormData((prev) => ({ ...prev, invoice_date: val }))
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    تعمیرکار
                  </label>
                  <select
                    name="technician_id"
                    value={formData.technician_id}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 bg-white"
                  >
                    <option value="">انتخاب تعمیرکار...</option>
                    {technicianOptions.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    گارانتی (ماه)
                  </label>
                  <input
                    type="number"
                    name="warranty_months"
                    value={formData.warranty_months}
                    onChange={handleInputChange}
                    min="0"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    توضیحات
                  </label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleInputChange}
                    rows="3"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                    placeholder="توضیحات اضافی..."
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Items & Totals */}
          <div className="lg:col-span-2">
            {/* Items */}
            <div className="bg-white shadow rounded-lg p-3 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                  <CubeIcon className="w-5 h-5 text-gray-600" />
                  اقلام فاکتور
                </h2>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddItem("inventory")}
                    className="bg-green-100 text-green-700 px-3 py-2 rounded-lg hover:bg-green-200 text-sm flex items-center gap-1"
                  >
                    <PlusIcon className="w-4 h-4" />
                    از انبار
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddItem("service")}
                    className="bg-blue-100 text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-200 text-sm flex items-center gap-1"
                  >
                    <PlusIcon className="w-4 h-4" />
                    خدمت
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddItem("custom")}
                    className="bg-purple-100 text-purple-700 px-3 py-2 rounded-lg hover:bg-purple-200 text-sm flex items-center gap-1"
                  >
                    <PencilSquareIcon className="w-4 h-4" />
                    دلخواه
                  </button>
                </div>
              </div>

              {errors.items && (
                <p className="text-sm text-red-600 mb-4">{errors.items}</p>
              )}

              {selectedItems.length === 0 ? (
                <div className="text-center py-10 text-gray-400 border-2  border-dashed rounded-lg">
                  <p>هیچ آیتمی اضافه نشده است</p>
                  <p className="text-sm mt-1">
                    از دکمه‌های بالا برای افزودن آیتم استفاده کنید
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedItems.map((item, index) => (
                    <div
                      key={index}
                      className="border border-gray-300 rounded-lg p-4 bg-gray-50"
                    >
                      <div className="grid grid-cols-12 gap-2 items-center">
                        {/* Item Type Badge */}
                        <div className="col-span-2">
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${
                              item.item_type === "inventory"
                                ? "bg-green-100 text-green-700"
                                : item.item_type === "service"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-purple-100 text-purple-700"
                            }`}
                          >
                            {item.item_type === "inventory"
                              ? "انبار"
                              : item.item_type === "service"
                                ? "خدمت"
                                : "دلخواه"}
                          </span>
                        </div>

                        {/* Name/Selection */}
                        <div className="col-span-4">
                          {item.item_type === "inventory" ? (
                            <SearchableSelect
                              options={itemOptions}
                              value={item.item_id}
                              onChange={(val) =>
                                handleItemChange(index, "item_id", val)
                              }
                              onSearch={handleItemSearch}
                              onOpen={() => handleItemSearch("")}
                              placeholder="جستجوی کالا..."
                              error={errors[`item_${index}_name`]}
                            />
                          ) : item.item_type === "service" ? (
                            <select
                              value={item.name}
                              onChange={(e) =>
                                handleItemChange(index, "name", e.target.value)
                              }
                              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                            >
                              <option value="">انتخاب خدمت...</option>
                              {services.map((s) => (
                                <option key={s.id} value={s.name}>
                                  {s.name}
                                </option>
                              ))}
                              <option value="__custom__">خدمت دلخواه...</option>
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) =>
                                handleItemChange(index, "name", e.target.value)
                              }
                              placeholder="نام آیتم"
                              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                            />
                          )}
                        </div>

                        {/* Quantity */}
                        <div className="col-span-1">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "quantity",
                                parseFloat(e.target.value) || 1,
                              )
                            }
                            min="0.01"
                            step="0.01"
                            className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
                          />
                        </div>

                        {/* Unit */}
                        <div className="col-span-1">
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) =>
                              handleItemChange(index, "unit", e.target.value)
                            }
                            className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
                          />
                        </div>

                        {/* Unit Price */}
                        <div className="col-span-2">
                          <input
                            type="number"
                            value={item.unit_price}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "unit_price",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            min="0"
                            className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
                          />
                        </div>

                        {/* Total */}
                        <div className="col-span-1 text-left">
                          <span className="text-sm font-medium">
                            {formatCurrency(calculateItemTotal(item))}
                          </span>
                        </div>

                        {/* Delete */}
                        <div className="col-span-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(index)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {errors[`item_${index}_quantity`] && (
                        <p className="text-xs text-red-600 mt-1">
                          {errors[`item_${index}_quantity`]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                محاسبات
              </h2>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>جمع کل:</span>
                  <span className="font-medium">
                    {formatCurrency(calculateSubtotal())} ریال
                  </span>
                </div>

                {/* Discount */}
                <div className="flex items-center gap-3">
                  <select
                    name="discount_type"
                    value={formData.discount_type}
                    onChange={handleInputChange}
                    className="border border-gray-300 rounded px-3 py-2 text-sm"
                  >
                    <option value="">بدون تخفیف</option>
                    <option value="percentage">درصدی</option>
                    <option value="fixed">مبلغ ثابت</option>
                  </select>
                  {formData.discount_type && (
                    <input
                      type="number"
                      name="discount_value"
                      value={formData.discount_value}
                      onChange={handleInputChange}
                      min="0"
                      className="border border-gray-300 rounded px-3 py-2 text-sm w-32"
                    />
                  )}
                  {formData.discount_type && (
                    <span className="text-red-600 mr-auto">
                      -{formatCurrency(calculateDiscount())} ریال
                    </span>
                  )}
                </div>

                {/* Tax */}
                <div className="flex items-center gap-3">
                  <span>مالیات (%):</span>
                  <input
                    type="number"
                    name="tax_rate"
                    value={formData.tax_rate}
                    onChange={handleInputChange}
                    min="0"
                    max="100"
                    step="0.5"
                    className="border border-gray-300 rounded px-3 py-2 text-sm w-24"
                  />
                  <span className="text-blue-600 mr-auto">
                    +{formatCurrency(calculateTax())} ریال
                  </span>
                </div>

                <div className="flex justify-between pt-3 border-t text-lg font-bold">
                  <span>مبلغ نهایی:</span>
                  <span className="text-blue-600">
                    {formatCurrency(calculateTotal())} ریال
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Buttons */}
        <div className="mt-6 flex justify-end gap-3">
          <Link
            to="/repair-invoices"
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            انصراف
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading
              ? "در حال ذخیره..."
              : isEditMode
                ? "ویرایش فاکتور"
                : "ثبت فاکتور"}
          </button>
        </div>
      </form>
    </div>
  );
}
