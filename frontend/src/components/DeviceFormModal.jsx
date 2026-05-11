// src/components/DeviceFormModal.jsx
import { useState, useEffect } from "react";
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
import ImageUploader from "./ImageUploader";
import PersianDatePicker from "./PersianDatePicker";
import { XMarkIcon, WrenchScrewdriverIcon } from "@heroicons/react/24/solid";

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

const INITIAL_CUSTOMER = { name: "", phone: "" };

const STATUS_OPTIONS = [
  { value: "pending", label: "در انتظار بررسی" },
  { value: "diagnosing", label: "در حال بررسی" },
  { value: "waiting_for_parts", label: "در انتظار قطعه" },
  { value: "repairing", label: "در حال تعمیر" },
  { value: "repaired", label: "تعمیر شده" },
  { value: "delivered", label: "تحویل داده شده" },
  { value: "unrepairable", label: "غیرقابل تعمیر" },
];

export default function DeviceFormModal({
  deviceId,
  isOpen,
  onClose,
  onSuccess,
}) {
  const isEdit = Boolean(deviceId);
  const [form, setForm] = useState(INITIAL_FORM);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState(INITIAL_CUSTOMER);
  const [images, setImages] = useState([]);
  const [pendingImages, setPendingImages] = useState([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [personnelList, setPersonnelList] = useState([]);
  const [selectedPersonnel, setSelectedPersonnel] = useState([]);
  const [personnelSearch, setPersonnelSearch] = useState("");
  const [showPersonnelDropdown, setShowPersonnelDropdown] = useState(false);

  const filteredPersonnel = personnelList.filter((p) => {
    const alreadySelected = selectedPersonnel.some((s) => s.id === p.id);
    const displayName = p.name ?? p.full_name ?? "";
    return !alreadySelected && displayName.includes(personnelSearch);
  });

  const filteredCustomers = customers.filter(
    (c) => c.name.includes(customerSearch) || c.phone.includes(customerSearch),
  );

  useEffect(() => {
    if (isOpen) {
      loadCustomers();
      loadPersonnel();
      if (isEdit) loadDevice();
      else resetForm();
    }
  }, [isOpen, deviceId]);

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setImages([]);
    setPendingImages([]);
    setSelectedPersonnel([]);
    setCustomerSearch("");
  };

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
        getDevice(deviceId),
        getDeviceImages(deviceId),
        getDeviceAssignments(deviceId),
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

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  const handleDateChange = (fieldName) => (gregorianValue) =>
    setForm((prev) => ({ ...prev, [fieldName]: gregorianValue ?? "" }));

  const handleAddCustomer = async () => {
    if (!newCustomer.name || !newCustomer.phone)
      return toast.error("نام و شماره تلفن الزامی است");
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
    setSelectedPersonnel((prev) => [
      ...prev,
      {
        ...person,
        name: person.name ?? person.full_name ?? person.username ?? "—",
      },
    ]);
    setPersonnelSearch("");
    setShowPersonnelDropdown(false);
  };

  const handleRemovePersonnel = (personId) =>
    setSelectedPersonnel((prev) => prev.filter((p) => p.id !== personId));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.device_name.trim()) return toast.error("نام دستگاه الزامی است");
    setLoading(true);
    try {
      let devId = deviceId;
      if (isEdit) {
        await updateDevice(deviceId, form);
        if (pendingImages.length > 0) {
          await uploadDeviceImages(deviceId, pendingImages);
          setPendingImages([]);
        }
        toast.success("دستگاه ویرایش شد");
      } else {
        const res = await createDevice(form);
        devId = res.data.id;
        if (pendingImages.length > 0) {
          await uploadDeviceImages(devId, pendingImages);
          setPendingImages([]);
        }
        toast.success("دستگاه ثبت شد");
      }
      await setDeviceAssignments(
        devId,
        selectedPersonnel.map((p) => p.id),
      );
      onSuccess && onSuccess();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error || "خطا در ثبت دستگاه");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-5xl my-2 sm:my-8"
        dir="rtl"
      >
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl z-10">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
            <WrenchScrewdriverIcon className="w-5 h-5 text-gray-600" />
            {isEdit ? `ویرایش دستگاه #${deviceId}` : "ثبت دستگاه جدید"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 p-3 sm:p-4">
            <div>
              <label className="block font-medium text-gray-700 mb-1">
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
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
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
                  className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg whitespace-nowrap"
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
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="شماره تلفن *"
                    value={newCustomer.phone}
                    onChange={(e) =>
                      setNewCustomer((p) => ({ ...p, phone: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
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
              <label className="block font-medium text-gray-700 mb-1">
                مسئول(ین) دستگاه
              </label>
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
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
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
              {selectedPersonnel.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
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
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 px-3 sm:px-4">
            <div>
              <label className="block font-medium text-gray-700 mb-1">
                نام دستگاه *
              </label>
              <input
                name="device_name"
                value={form.device_name}
                onChange={handleChange}
                placeholder="مثال: لپ‌تاپ، موبایل"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block font-medium text-gray-700 mb-1">
                برند
              </label>
              <input
                name="brand"
                value={form.brand}
                onChange={handleChange}
                placeholder="مثال: Samsung"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block font-medium text-gray-700 mb-1">
                مدل
              </label>
              <input
                name="model"
                value={form.model}
                onChange={handleChange}
                placeholder="مثال: Galaxy S21"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block font-medium text-gray-700 mb-1">
                سریال
              </label>
              <input
                name="serial_number"
                value={form.serial_number}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 px-3 sm:px-4">
            <div>
              <label className="block font-medium text-gray-700 mb-1">
                تاریخ ورود *
              </label>
              <PersianDatePicker
                value={form.entry_date}
                onChange={handleDateChange("entry_date")}
                placeholder="انتخاب تاریخ ورود"
                required
              />
            </div>
            <div>
              <label className="block font-medium text-gray-700 mb-1">
                تاریخ خروج
              </label>
              <PersianDatePicker
                value={form.exit_date}
                onChange={handleDateChange("exit_date")}
                placeholder="انتخاب تاریخ خروج"
                clearable
              />
            </div>
          </div>

          <div className="px-3 sm:px-4">
            <label className="block font-medium text-gray-700 mb-1">
              وضعیت
            </label>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 px-3 sm:px-4">
            <div>
              <label className="block font-medium text-gray-700 mb-1">
                توضیحات
              </label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-28 sm:h-[calc(100%-28px)]"
              />
            </div>
            <div>
              <label className="block font-medium text-gray-700 mb-1 w-full">
                عکس های دستگاه
              </label>
              <ImageUploader
                deviceId={isEdit ? deviceId : null}
                existingImages={images}
                pendingFiles={pendingImages}
                onPendingChange={setPendingImages}
                onDeleteExisting={(imageId) =>
                  setImages((imgs) => imgs.filter((i) => i.id !== imageId))
                }
                onUploadDone={(newImgs) =>
                  setImages((prev) => [...prev, ...newImgs])
                }
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-end gap-2 p-3 sm:p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading
                ? "در حال ذخیره..."
                : isEdit
                  ? "ذخیره تغییرات"
                  : "ثبت دستگاه"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              انصراف
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
