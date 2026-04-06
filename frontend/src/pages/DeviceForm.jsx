import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createDevice,
  updateDevice,
  getDevice,
  getCustomers,
  createCustomer,
} from "../api";
import { toast } from "react-hot-toast";

const INITIAL_FORM = {
  reception_number: "",
  customer_id: "",
  device_name: "",
  brand: "",
  model: "",
  serial_number: "",
  entry_date: new Date().toISOString().split("T")[0],
  exit_date: "",
  status: "در انتظار",
  description: "",
};

const INITIAL_CUSTOMER = {
  name: "",
  phone: "",
};

const STATUS_OPTIONS = [
  { value: "در انتظار", label: "در انتظار" },
  { value: "در حال تعمیر", label: "در حال تعمیر" },
  { value: "تعمیر شده", label: "تعمیر شده" },
  { value: "تحویل داده شده", label: "تحویل داده شده" },
];

export default function DeviceForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(INITIAL_FORM);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState(INITIAL_CUSTOMER);

  useEffect(() => {
    loadCustomers();
    if (isEdit) loadDevice();
  }, [id]);

  const loadCustomers = async () => {
    try {
      const res = await getCustomers();
      setCustomers(res.data);
    } catch (error) {
      toast.error("خطا در بارگذاری مشتریان");
    }
  };

  const loadDevice = async () => {
    try {
      const res = await getDevice(id);
      setForm({
        reception_number: res.data.reception_number || "",
        customer_id: res.data.customer_id || "",
        device_name: res.data.device_name || "",
        brand: res.data.brand || "",
        model: res.data.model || "",
        serial_number: res.data.serial_number || "",
        entry_date: res.data.entry_date || "",
        exit_date: res.data.exit_date || "",
        status: res.data.status || "در انتظار",
        description: res.data.description || "",
      });
    } catch (error) {
      toast.error("خطا در بارگذاری دستگاه");
    }
  };

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleAddCustomer = async () => {
    if (!newCustomer.name || !newCustomer.phone) {
      toast.error("نام و شماره تلفن الزامی است");
      return;
    }
    try {
      const res = await createCustomer(newCustomer);
      const created = res.data;
      await loadCustomers();
      setForm((prev) => ({ ...prev, customer_id: created.id }));
      setShowNewCustomer(false);
      setNewCustomer(INITIAL_CUSTOMER);
      toast.success("مشتری اضافه شد");
    } catch {
      toast.error("خطا در ثبت مشتری");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.reception_number.trim()) {
      toast.error("شماره پذیرش الزامی است");
      return;
    }
    if (!form.device_name.trim()) {
      toast.error("نام دستگاه الزامی است");
      return;
    }

    setLoading(true);
    try {
      if (isEdit) {
        await updateDevice(id, form);
        toast.success("دستگاه ویرایش شد");
      } else {
        await createDevice(form);
        toast.success("دستگاه ثبت شد");
      }
      navigate("/devices");
    } catch (error) {
      toast.error(error.response?.data?.error || "خطا در ثبت دستگاه");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {isEdit ? "ویرایش دستگاه" : "ثبت دستگاه جدید"}
      </h1>

      <form
        onSubmit={handleSubmit}
        className="bg-white shadow rounded-lg p-6 space-y-5"
      >
        {/* شماره پذیرش */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            شماره پذیرش *
          </label>
          <input
            name="reception_number"
            value={form.reception_number}
            onChange={handleChange}
            placeholder="شماره پذیرش"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        {/* مشتری */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            مشتری
          </label>
          <div className="flex gap-2">
            <select
              name="customer_id"
              value={form.customer_id}
              onChange={handleChange}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">انتخاب مشتری...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} - {c.phone}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowNewCustomer((v) => !v)}
              className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
            >
              + مشتری جدید
            </button>
          </div>

          {showNewCustomer && (
            <div className="mt-3 p-4 bg-gray-50 rounded-lg space-y-3 border border-gray-200">
              <input
                placeholder="نام مشتری *"
                value={newCustomer.name}
                onChange={(e) =>
                  setNewCustomer((p) => ({ ...p, name: e.target.value }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                placeholder="شماره تلفن *"
                value={newCustomer.phone}
                onChange={(e) =>
                  setNewCustomer((p) => ({ ...p, phone: e.target.value }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAddCustomer}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  ثبت مشتری
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewCustomer(false)}
                  className="px-4 py-2 text-sm bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  انصراف
                </button>
              </div>
            </div>
          )}
        </div>

        {/* نام دستگاه و برند */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              نام دستگاه *
            </label>
            <input
              name="device_name"
              value={form.device_name}
              onChange={handleChange}
              placeholder="مثال: لپ‌تاپ، موبایل"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              برند
            </label>
            <input
              name="brand"
              value={form.brand}
              onChange={handleChange}
              placeholder="مثال: Samsung"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* مدل و سریال */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              مدل
            </label>
            <input
              name="model"
              value={form.model}
              onChange={handleChange}
              placeholder="مثال: Galaxy S21"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              سریال
            </label>
            <input
              name="serial_number"
              value={form.serial_number}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* تاریخ ورود و خروج */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              تاریخ ورود
            </label>
            <input
              name="entry_date"
              type="date"
              value={form.entry_date}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              تاریخ خروج
            </label>
            <input
              name="exit_date"
              type="date"
              value={form.exit_date}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* وضعیت */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            وضعیت
          </label>
          <select
            name="status"
            value={form.status}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* توضیحات */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            توضیحات
          </label>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* دکمه‌ها */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading
              ? "در حال ذخیره..."
              : isEdit
                ? "ذخیره تغییرات"
                : "ثبت دستگاه"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/devices")}
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            انصراف
          </button>
        </div>
      </form>
    </div>
  );
}
