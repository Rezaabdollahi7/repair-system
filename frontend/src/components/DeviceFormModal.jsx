import { useState, useEffect, useCallback, useRef } from "react";
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
  searchCustomers,
} from "../api";
import { toast } from "react-hot-toast";
import ImageUploader from "./ImageUploader";
import PersianDatePicker from "./PersianDatePicker";
import {
  XMarkIcon,
  WrenchScrewdriverIcon,
  UserGroupIcon,
  UserIcon,
  CubeIcon,
  TagIcon,
  CalendarIcon,
  ClipboardDocumentListIcon,
  PhotoIcon,
  CheckBadgeIcon,
} from "@heroicons/react/24/solid";
import { useDebounce } from "../utils/helpers";

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
const INITIAL_DEVICE_NAME = { name: "" };
const INITIAL_BRAND = { name: "" };

const STATUS_OPTIONS = [
  {
    value: "pending",
    label: "در انتظار بررسی",
    color: "bg-yellow-100 text-yellow-800",
  },
  {
    value: "diagnosing",
    label: "در حال بررسی",
    color: "bg-cyan-100 text-cyan-800",
  },
  {
    value: "waiting_for_parts",
    label: "در انتظار قطعه",
    color: "bg-orange-100 text-orange-800",
  },
  {
    value: "repairing",
    label: "در حال تعمیر",
    color: "bg-purple-100 text-purple-800",
  },
  { value: "repaired", label: "تعمیر شده", color: "bg-gray-100 text-gray-800" },
  {
    value: "ready_for_pickup",
    label: "آماده تحویل",
    color: "bg-blue-100 text-blue-800",
  },
  {
    value: "delivered",
    label: "تحویل داده شده",
    color: "bg-green-100 text-green-800",
  },
  {
    value: "unrepairable",
    label: "غیرقابل تعمیر",
    color: "bg-red-100 text-red-800",
  },
  {
    value: "not_repaired",
    label: "تعمیر نشد",
    color: "bg-orange-100 text-red-800",
  },
];

export default function DeviceFormModal({
  deviceId,
  isOpen,
  onClose,
  onSuccess,
}) {
  const isEdit = Boolean(deviceId);
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [showNewDeviceName, setShowNewDeviceName] = useState(false);
  const [showNewBrand, setShowNewBrand] = useState(false);
  const [newCustomer, setNewCustomer] = useState(INITIAL_CUSTOMER);
  const [newDeviceName, setNewDeviceName] = useState(INITIAL_DEVICE_NAME);
  const [newBrand, setNewBrand] = useState(INITIAL_BRAND);
  const [images, setImages] = useState([]);
  const [pendingImages, setPendingImages] = useState([]);

  // جستجوی مشتری
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerResults, setCustomerResults] = useState([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // جستجوی نام دستگاه (برای انتخاب از دستگاه‌های موجود)
  const [deviceNameSearch, setDeviceNameSearch] = useState("");
  const [showDeviceNameDropdown, setShowDeviceNameDropdown] = useState(false);
  const [deviceNameResults, setDeviceNameResults] = useState([]);
  const [searchingDeviceNames, setSearchingDeviceNames] = useState(false);

  // جستجوی برند
  const [brandSearch, setBrandSearch] = useState("");
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [brandResults, setBrandResults] = useState([]);
  const [searchingBrands, setSearchingBrands] = useState(false);

  const [personnelList, setPersonnelList] = useState([]);
  const [selectedPersonnel, setSelectedPersonnel] = useState([]);
  const [personnelSearch, setPersonnelSearch] = useState("");
  const [showPersonnelDropdown, setShowPersonnelDropdown] = useState(false);

  const debouncedCustomerSearch = useDebounce(customerSearch, 300);
  const debouncedDeviceNameSearch = useDebounce(deviceNameSearch, 300);
  const debouncedBrandSearch = useDebounce(brandSearch, 300);

  const filteredPersonnel = personnelList.filter((p) => {
    const alreadySelected = selectedPersonnel.some((s) => s.id === p.id);
    const displayName = p.name ?? p.full_name ?? "";
    return !alreadySelected && displayName.includes(personnelSearch);
  });

  // جستجوی مشتری از سرور
  const searchCustomersAPI = useCallback(async (query) => {
    if (!query || query.trim() === "") {
      setCustomerResults([]);
      return;
    }
    setSearchingCustomers(true);
    try {
      const res = await searchCustomers(query);
      setCustomerResults(res.data?.data || res.data || []);
    } catch (error) {
      console.error("خطا در جستجوی مشتری:", error);
      setCustomerResults([]);
    } finally {
      setSearchingCustomers(false);
    }
  }, []);

  // جستجوی نام دستگاه از دستگاه‌های موجود
  const searchDeviceNamesAPI = useCallback(async (query) => {
    if (!query || query.trim() === "") {
      setDeviceNameResults([]);
      return;
    }
    setSearchingDeviceNames(true);
    try {
      // از API موجود برای جستجوی دستگاه‌ها استفاده می‌کنیم
      const { getDevices } = await import("../api");
      const res = await getDevices({ search: query, limit: 20 });
      const devices = res.data?.data || res.data || [];
      // استخراج نام‌های unique دستگاه
      const uniqueNames = [
        ...new Map(devices.map((d) => [d.device_name, d])).values(),
      ];
      setDeviceNameResults(uniqueNames);
    } catch (error) {
      console.error("خطا در جستجوی نام دستگاه:", error);
      setDeviceNameResults([]);
    } finally {
      setSearchingDeviceNames(false);
    }
  }, []);

  // جستجوی برند از دستگاه‌های موجود
  const searchBrandsAPI = useCallback(async (query) => {
    if (!query || query.trim() === "") {
      setBrandResults([]);
      return;
    }
    setSearchingBrands(true);
    try {
      const { getDevices } = await import("../api");
      const res = await getDevices({ search: query, limit: 20 });
      const devices = res.data?.data || res.data || [];
      // استخراج برندهای unique
      const uniqueBrands = [
        ...new Map(
          devices.filter((d) => d.brand).map((d) => [d.brand, d]),
        ).values(),
      ];
      setBrandResults(uniqueBrands);
    } catch (error) {
      console.error("خطا در جستجوی برند:", error);
      setBrandResults([]);
    } finally {
      setSearchingBrands(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadPersonnel();
      if (isEdit) loadDevice();
      else resetForm();
    }
  }, [isOpen, deviceId]);

  useEffect(() => {
    if (customerSearch && customerSearch.trim()) {
      searchCustomersAPI(debouncedCustomerSearch);
    } else {
      setCustomerResults([]);
    }
  }, [debouncedCustomerSearch, searchCustomersAPI]);

  useEffect(() => {
    if (deviceNameSearch && deviceNameSearch.trim()) {
      searchDeviceNamesAPI(debouncedDeviceNameSearch);
    } else {
      setDeviceNameResults([]);
    }
  }, [debouncedDeviceNameSearch, searchDeviceNamesAPI]);

  useEffect(() => {
    if (brandSearch && brandSearch.trim()) {
      searchBrandsAPI(debouncedBrandSearch);
    } else {
      setBrandResults([]);
    }
  }, [debouncedBrandSearch, searchBrandsAPI]);

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setImages([]);
    setPendingImages([]);
    setSelectedPersonnel([]);
    setCustomerSearch("");
    setSelectedCustomer(null);
    setDeviceNameSearch("");
    setBrandSearch("");
    setShowNewCustomer(false);
    setShowNewDeviceName(false);
    setShowNewBrand(false);
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
        setSelectedCustomer({
          id: deviceRes.data.customer_id,
          name: deviceRes.data.customer_name,
          phone: deviceRes.data.customer_phone,
        });
      }
      if (deviceRes.data.device_name) {
        setDeviceNameSearch(deviceRes.data.device_name);
      }
      if (deviceRes.data.brand) {
        setBrandSearch(deviceRes.data.brand);
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
      setForm((prev) => ({ ...prev, customer_id: created.id }));
      setSelectedCustomer(created);
      setShowNewCustomer(false);
      setNewCustomer(INITIAL_CUSTOMER);
      toast.success("مشتری اضافه شد");
      setCustomerSearch(`${created.name} - ${created.phone}`);
    } catch {
      toast.error("خطا در ثبت مشتری");
    }
  };

  const handleAddDeviceName = () => {
    if (!newDeviceName.name) return toast.error("نام دستگاه الزامی است");
    setForm((prev) => ({ ...prev, device_name: newDeviceName.name }));
    setDeviceNameSearch(newDeviceName.name);
    setShowNewDeviceName(false);
    setNewDeviceName(INITIAL_DEVICE_NAME);
    toast.success("نام دستگاه اضافه شد");
  };

  const handleAddBrand = () => {
    if (!newBrand.name) return toast.error("نام برند الزامی است");
    setForm((prev) => ({ ...prev, brand: newBrand.name }));
    setBrandSearch(newBrand.name);
    setShowNewBrand(false);
    setNewBrand(INITIAL_BRAND);
    toast.success("برند اضافه شد");
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

  const SectionTitle = ({ icon: Icon, title }) => (
    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-blue-100">
      <Icon className="size-5 text-blue-600" />
      <span className="text-sm font-semibold text-gray-700">{title}</span>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-2 sm:my-8"
        dir="rtl"
      >
        {/* هدر با تم آبی */}
        <div className="sticky top-0 bg-white rounded-t-2xl border-b border-blue-100 px-4 sm:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-xl">
              <WrenchScrewdriverIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {isEdit ? `ویرایش دستگاه #${deviceId}` : "ثبت دستگاه جدید"}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6">
          {/* بخش اول: مشتری و مسئول */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* مشتری */}
            <div>
              <SectionTitle icon={UserGroupIcon} title="اطلاعات مشتری" />
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      placeholder="جستجو نام یا شماره..."
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      onBlur={() =>
                        setTimeout(() => setShowCustomerDropdown(false), 200)
                      }
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {showCustomerDropdown && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                        <div
                          className="px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-50 cursor-pointer border-b border-gray-100"
                          onMouseDown={() => {
                            setForm((p) => ({ ...p, customer_id: "" }));
                            setCustomerSearch("");
                            setSelectedCustomer(null);
                            setShowCustomerDropdown(false);
                          }}
                        >
                          بدون مشتری
                        </div>
                        {searchingCustomers ? (
                          <div className="px-3 py-4 text-sm text-gray-400 text-center">
                            در حال جستجو...
                          </div>
                        ) : customerResults.length > 0 ? (
                          customerResults.map((c) => (
                            <div
                              key={c.id}
                              onMouseDown={() => {
                                setForm((p) => ({ ...p, customer_id: c.id }));
                                setSelectedCustomer(c);
                                setCustomerSearch(
                                  `${c.name} - ${c.phone || ""}`,
                                );
                                setShowCustomerDropdown(false);
                              }}
                              className="px-3 py-2.5 text-sm hover:bg-blue-50 cursor-pointer border-b border-gray-50"
                            >
                              <div className="font-medium">{c.name}</div>
                              {c.phone && (
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {c.phone}
                                </div>
                              )}
                            </div>
                          ))
                        ) : customerSearch ? (
                          <div className="px-3 py-4 text-xs text-gray-400 text-center">
                            مشتری‌ای یافت نشد
                          </div>
                        ) : (
                          <div className="px-3 py-4 text-xs text-gray-400 text-center">
                            برای جستجو نام یا شماره تلفن وارد کنید
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNewCustomer(true)}
                    className="px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors whitespace-nowrap"
                  >
                    + جدید
                  </button>
                </div>

                {showNewCustomer && (
                  <div className="p-4 bg-blue-50 rounded-xl space-y-3 border border-blue-200">
                    <input
                      placeholder="نام مشتری *"
                      value={newCustomer.name}
                      onChange={(e) =>
                        setNewCustomer((p) => ({ ...p, name: e.target.value }))
                      }
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      placeholder="شماره تلفن *"
                      value={newCustomer.phone}
                      onChange={(e) =>
                        setNewCustomer((p) => ({ ...p, phone: e.target.value }))
                      }
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
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
            </div>

            {/* مسئول */}
            <div>
              <SectionTitle icon={UserIcon} title="مسئول(ین) دستگاه" />
              <div className="space-y-3">
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
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500"
                  />
                  {showPersonnelDropdown && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
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
                            className="px-3 py-2.5 text-sm hover:bg-blue-50 cursor-pointer flex items-center justify-between"
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
                  <div className="flex flex-wrap gap-2">
                    {selectedPersonnel.map((person) => (
                      <span
                        key={person.id}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full"
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
          </div>

          {/* بخش دوم: اطلاعات دستگاه */}
          <div>
            <SectionTitle icon={CubeIcon} title="اطلاعات دستگاه" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* نام دستگاه */}
              <div>
                <label className="block font-medium text-gray-700 mb-1.5">
                  نام دستگاه <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      placeholder="مثال: لپ‌تاپ، موبایل"
                      value={deviceNameSearch}
                      onChange={(e) => {
                        setDeviceNameSearch(e.target.value);
                        setForm((p) => ({ ...p, device_name: e.target.value }));
                        setShowDeviceNameDropdown(true);
                      }}
                      onFocus={() => setShowDeviceNameDropdown(true)}
                      onBlur={() =>
                        setTimeout(() => setShowDeviceNameDropdown(false), 200)
                      }
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                    {showDeviceNameDropdown && deviceNameResults.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        {searchingDeviceNames ? (
                          <div className="px-3 py-2 text-sm text-gray-400">
                            در حال جستجو...
                          </div>
                        ) : (
                          deviceNameResults.map((d) => (
                            <div
                              key={d.id}
                              onMouseDown={() => {
                                setForm((p) => ({
                                  ...p,
                                  device_name: d.device_name,
                                }));
                                setDeviceNameSearch(d.device_name);
                                setShowDeviceNameDropdown(false);
                              }}
                              className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer"
                            >
                              {d.device_name}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNewDeviceName(true)}
                    className="px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors whitespace-nowrap"
                  >
                    + جدید
                  </button>
                </div>
                {showNewDeviceName && (
                  <div className="mt-2 p-3 bg-blue-50 rounded-xl border border-blue-200">
                    <input
                      placeholder="نام دستگاه جدید"
                      value={newDeviceName.name}
                      onChange={(e) =>
                        setNewDeviceName({ name: e.target.value })
                      }
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleAddDeviceName}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg"
                      >
                        ثبت
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowNewDeviceName(false)}
                        className="px-3 py-1.5 text-sm bg-gray-200 rounded-lg"
                      >
                        انصراف
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* برند */}
              <div>
                <label className="block font-medium text-gray-700 mb-1.5">
                  برند
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      placeholder="مثال: Samsung"
                      value={brandSearch}
                      onChange={(e) => {
                        setBrandSearch(e.target.value);
                        setForm((p) => ({ ...p, brand: e.target.value }));
                        setShowBrandDropdown(true);
                      }}
                      onFocus={() => setShowBrandDropdown(true)}
                      onBlur={() =>
                        setTimeout(() => setShowBrandDropdown(false), 200)
                      }
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                    {showBrandDropdown && brandResults.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        {searchingBrands ? (
                          <div className="px-3 py-2 text-sm text-gray-400">
                            در حال جستجو...
                          </div>
                        ) : (
                          brandResults.map((b) => (
                            <div
                              key={b.id}
                              onMouseDown={() => {
                                setForm((p) => ({ ...p, brand: b.brand }));
                                setBrandSearch(b.brand);
                                setShowBrandDropdown(false);
                              }}
                              className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer"
                            >
                              {b.brand}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNewBrand(true)}
                    className="px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors whitespace-nowrap"
                  >
                    + جدید
                  </button>
                </div>
                {showNewBrand && (
                  <div className="mt-2 p-3 bg-blue-50 rounded-xl border border-blue-200">
                    <input
                      placeholder="برند جدید"
                      value={newBrand.name}
                      onChange={(e) => setNewBrand({ name: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleAddBrand}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg"
                      >
                        ثبت
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowNewBrand(false)}
                        className="px-3 py-1.5 text-sm bg-gray-200 rounded-lg"
                      >
                        انصراف
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* مدل */}
              <div>
                <label className="block font-medium text-gray-700 mb-1.5">
                  مدل
                </label>
                <input
                  name="model"
                  value={form.model}
                  onChange={handleChange}
                  placeholder="مثال: Galaxy S21"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* سریال */}
              <div>
                <label className="block font-medium text-gray-700 mb-1.5">
                  سریال
                </label>
                <input
                  name="serial_number"
                  value={form.serial_number}
                  onChange={handleChange}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* بخش سوم: تاریخ‌ها */}
          <div>
            <SectionTitle icon={CalendarIcon} title="تاریخ‌ها" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-gray-700 mb-1.5">
                  تاریخ ورود <span className="text-red-500">*</span>
                </label>
                <PersianDatePicker
                  value={form.entry_date}
                  onChange={handleDateChange("entry_date")}
                  placeholder="انتخاب تاریخ ورود"
                  required
                />
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-1.5">
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
          </div>

          {/* بخش چهارم: وضعیت و توضیحات */}
          <div>
            <SectionTitle icon={CheckBadgeIcon} title="وضعیت و توضیحات" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-gray-700 mb-1.5">
                  وضعیت
                </label>
                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-1.5">
                  توضیحات
                </label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows="7"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="توضیحات اضافی..."
                />
              </div>
            </div>
          </div>

          {/* بخش پنجم: عکس‌ها */}
          <div>
            <SectionTitle icon={PhotoIcon} title="عکس‌های دستگاه" />
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

          {/* دکمه‌های اقدام */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading
                ? "در حال ذخیره..."
                : isEdit
                  ? "ذخیره تغییرات"
                  : "ثبت دستگاه"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
