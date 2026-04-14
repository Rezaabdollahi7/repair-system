// src/pages/DeviceForm.jsx
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createDevice,
  updateDevice,
  getDevice,
  getCustomers,
  createCustomer,
  getDeviceImages,
  uploadDeviceImages,
  getPersonnel,
  getDeviceAssignments,
  setDeviceAssignments,
} from "../api";
import { toast } from "react-hot-toast";
import ImageUploader from "../components/ImageUploader";

const INITIAL_FORM = {
  customer_id: "",
  device_name: "",
  brand: "",
  model: "",
  serial_number: "",
  entry_date: new Date().toISOString().split("T")[0],
  exit_date: "",
  status: "pending",
  description: "",
};

const INITIAL_CUSTOMER = {
  name: "",
  phone: "",
};

const STATUS_OPTIONS = [
  { value: "pending", label: "در انتظار بررسی" },
  { value: "diagnosing", label: "در حال بررسی" },
  { value: "waiting_for_parts", label: "در انتظار قطعه" },
  { value: "repairing", label: "در حال تعمیر" },
  { value: "repaired", label: "تعمیر شده" },
  { value: "delivered", label: "تحویل داده شده" },
  { value: "unrepairable", label: "غیرقابل تعمیر" },
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
  const [images, setImages] = useState([]);
  const [pendingImages, setPendingImages] = useState([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  // ─── Personnel ─────────────────────────────────────────
  const [personnelList, setPersonnelList] = useState([]);
  const [selectedPersonnel, setSelectedPersonnel] = useState([]);
  const [personnelSearch, setPersonnelSearch] = useState("");
  const [showPersonnelDropdown, setShowPersonnelDropdown] = useState(false);

  const filteredPersonnel = personnelList.filter((p) => {
    const alreadySelected = selectedPersonnel.some((s) => s.id === p.id);

    const displayName = p.name ?? p.full_name ?? "";
    const matchSearch =
      displayName.includes(personnelSearch) ||
      (p.username && p.username.includes(personnelSearch));

    return !alreadySelected && matchSearch;
  });

  const filteredCustomers = customers.filter(
    (c) => c.name.includes(customerSearch) || c.phone.includes(customerSearch),
  );

  // ─── Load ─────────────────────────────────────────────────────
  useEffect(() => {
    loadCustomers();
    loadPersonnel();
    if (isEdit) loadDevice();
  }, [id]);

  const loadCustomers = async () => {
    try {
      const res = await getCustomers();
      setCustomers(res.data.data ?? res.data);
    } catch {
      toast.error("خطا در بارگذاری مشتریان");
    }
  };

  const loadPersonnel = async () => {
    try {
      const res = await getPersonnel({ limit: 200 });

      setPersonnelList(res.data.data ?? res.data);
    } catch {
      toast.error("خطا در بارگذاری پرسنل");
    }
  };

  const loadDevice = async () => {
    try {
      const [deviceRes, imgRes, assignRes] = await Promise.all([
        getDevice(id),
        getDeviceImages(id),
        getDeviceAssignments(id),
      ]);

      setImages(imgRes.data);

      setSelectedPersonnel(assignRes.data ?? []);

      setForm({
        customer_id: deviceRes.data.customer_id || "",
        device_name: deviceRes.data.device_name || "",
        brand: deviceRes.data.brand || "",
        model: deviceRes.data.model || "",
        serial_number: deviceRes.data.serial_number || "",
        entry_date: deviceRes.data.entry_date || "",
        exit_date: deviceRes.data.exit_date || "",
        status: deviceRes.data.status || "pending",
        description: deviceRes.data.description || "",
      });

      if (deviceRes.data.customer_name) {
        setCustomerSearch(
          `${deviceRes.data.customer_name} - ${deviceRes.data.customer_phone ?? ""}`,
        );
      }
    } catch {
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
      setCustomerSearch(`${created.name} - ${created.phone}`);
    } catch {
      toast.error("خطا در ثبت مشتری");
    }
  };

  const handleSelectPersonnel = (person) => {
    const normalized = {
      ...person,
      name: person.name ?? person.full_name ?? person.username ?? "—",
    };
    setSelectedPersonnel((prev) => [...prev, normalized]);
    setPersonnelSearch("");
    setShowPersonnelDropdown(false);
  };

  const handleRemovePersonnel = (personId) => {
    setSelectedPersonnel((prev) => prev.filter((p) => p.id !== personId));
  };

  // ─── Submit ───────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.device_name.trim()) {
      toast.error("نام دستگاه الزامی است");
      return;
    }
    setLoading(true);
    try {
      let deviceId = id;

      if (isEdit) {
        await updateDevice(id, form);
        if (pendingImages.length > 0) {
          await uploadDeviceImages(id, pendingImages);
          setPendingImages([]);
        }
        toast.success("دستگاه ویرایش شد");
      } else {
        const res = await createDevice(form);
        deviceId = res.data.id;
        if (pendingImages.length > 0) {
          await uploadDeviceImages(deviceId, pendingImages);
          setPendingImages([]);
        }
        toast.success("دستگاه ثبت شد");
      }

      const personnelIds = selectedPersonnel.map((p) => p.id);
      await setDeviceAssignments(deviceId, personnelIds);

      navigate("/devices");
    } catch (error) {
      toast.error(error.response?.data?.error || "خطا در ثبت دستگاه");
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div dir="rtl" className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {isEdit ? "ویرایش دستگاه" : "ثبت دستگاه جدید"}
      </h1>

      <form
        onSubmit={handleSubmit}
        className="bg-white shadow rounded-lg p-6 space-y-5 mt-5"
      >
        {isEdit && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              شماره پذیرش
            </label>
            <input
              value={id}
              readOnly
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            مشتری
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                placeholder="جستجو نام یا شماره..."
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {showDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  <div
                    className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 cursor-pointer"
                    onMouseDown={() => {
                      setForm((p) => ({ ...p, customer_id: "" }));
                      setCustomerSearch("");
                    }}
                  >
                    بدون مشتری
                  </div>
                  {filteredCustomers.map((c) => (
                    <div
                      key={c.id}
                      onMouseDown={() => {
                        setForm((p) => ({ ...p, customer_id: c.id }));
                        setCustomerSearch(`${c.name} - ${c.phone}`);
                        setShowDropdown(false);
                      }}
                      className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer"
                    >
                      {c.name} - {c.phone}
                    </div>
                  ))}
                </div>
              )}
            </div>
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            مسئول(ین) دستگاه
          </label>

          {selectedPersonnel.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedPersonnel.map((person) => (
                <span
                  key={person.id}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
                >
                  {person.name}
                  <button
                    type="button"
                    onClick={() => handleRemovePersonnel(person.id)}
                    className="text-blue-500 hover:text-blue-800 font-bold leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="relative">
            <input
              placeholder="جستجو و انتخاب مسئول..."
              value={personnelSearch}
              onChange={(e) => {
                setPersonnelSearch(e.target.value);
                setShowPersonnelDropdown(true);
              }}
              onFocus={() => setShowPersonnelDropdown(true)}
              onBlur={() =>
                setTimeout(() => setShowPersonnelDropdown(false), 150)
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {showPersonnelDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredPersonnel.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-400">
                    {personnelList.length === 0
                      ? "پرسنلی ثبت نشده"
                      : "موردی یافت نشد"}
                  </div>
                ) : (
                  filteredPersonnel.map((person) => (
                    <div
                      key={person.id}
                      onMouseDown={() => handleSelectPersonnel(person)}
                      className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer flex items-center justify-between"
                    >
                      <span>{person.name}</span>
                      {person.username && (
                        <span className="text-xs text-gray-400">
                          @{person.username}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {selectedPersonnel.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">
              اختیاری — دستگاه می‌تواند بدون مسئول باشد
            </p>
          )}
        </div>

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

        <ImageUploader
          deviceId={isEdit ? id : null}
          existingImages={images}
          pendingFiles={pendingImages}
          onPendingChange={setPendingImages}
          onDeleteExisting={(imageId) =>
            setImages((imgs) => imgs.filter((i) => i.id !== imageId))
          }
          onUploadDone={(newImgs) => setImages((prev) => [...prev, ...newImgs])}
        />

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
