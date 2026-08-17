import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  createDevice,
  updateDevice,
  getDevice,
  getDevices,
  createCustomer,
  getDeviceImages,
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
  CalendarIcon,
  PhotoIcon,
  CheckBadgeIcon,
} from "@heroicons/react/24/solid";
import { useDebounce } from "../utils/helpers";
import type {
  CustomerBody,
  CustomerListRow,
  Device,
  DeviceCreateBody,
  Id,
  ListedDeviceImage,
  Personnel,
} from "../types/api";

/**
 * The form holds every field as the inputs produce it. `customer_id` carries
 * "" for "no customer" — see DeviceCreateBody in types/api for what the
 * server makes of that.
 */
interface DeviceForm {
  customer_id: number | string;
  device_name: string;
  brand: string;
  model: string;
  serial_number: string;
  entry_date: string;
  exit_date: string;
  status: string;
  description: string;
}

/**
 * A technician as this form holds one. Assignments arrive from the server
 * with `name` already flattened; a person picked from the personnel list may
 * only have `full_name`, so handleSelectPersonnel normalises it.
 */
interface SelectedPerson {
  id: number;
  name: string;
  username?: string;
}

const INITIAL_FORM: DeviceForm = {
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

const INITIAL_CUSTOMER: CustomerBody = { name: "", phone: "" };
const INITIAL_DEVICE_NAME = { name: "" };
const INITIAL_BRAND = { name: "" };

const STATUS_OPTIONS = [
  {
    value: "pending",
    label: "در انتظار بررسی",
    color: "bg-warning-soft text-warning",
  },
  {
    value: "diagnosing",
    label: "در حال بررسی",
    color: "bg-primary-soft text-primary",
  },
  {
    value: "waiting_for_parts",
    label: "در انتظار قطعه",
    color: "bg-warning-soft text-warning",
  },
  {
    value: "repairing",
    label: "در حال تعمیر",
    color: "bg-primary-soft text-primary",
  },
  {
    value: "repaired",
    label: "تعمیر شده",
    color: "bg-surface-alt text-text-secondary",
  },
  {
    value: "ready_for_pickup",
    label: "آماده تحویل",
    color: "bg-primary-soft text-primary",
  },
  {
    value: "delivered",
    label: "تحویل داده شده",
    color: "bg-success-soft text-success",
  },
  {
    value: "unrepairable",
    label: "غیرقابل تعمیر",
    color: "bg-danger-soft text-danger",
  },
  {
    value: "not_repaired",
    label: "تعمیر نشد",
    color: "bg-warning-soft text-danger",
  },
];

interface SectionTitleProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}

function SectionTitle({ icon: Icon, title }: SectionTitleProps) {
  return (
    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-primary-soft">
      <Icon className="size-5 text-primary" />
      <span className="text-sm font-semibold text-text-primary">{title}</span>
    </div>
  );
}

interface DeviceFormModalProps {
  deviceId?: Id | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  zIndex?: number;
}

export default function DeviceFormModal({
  deviceId,
  isOpen,
  onClose,
  onSuccess,
}: DeviceFormModalProps) {
  const isEdit = Boolean(deviceId);
  const [form, setForm] = useState<DeviceForm>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [showNewDeviceName, setShowNewDeviceName] = useState(false);
  const [showNewBrand, setShowNewBrand] = useState(false);
  const [newCustomer, setNewCustomer] =
    useState<CustomerBody>(INITIAL_CUSTOMER);
  const [newDeviceName, setNewDeviceName] = useState(INITIAL_DEVICE_NAME);
  const [newBrand, setNewBrand] = useState(INITIAL_BRAND);
  const [images, setImages] = useState<ListedDeviceImage[]>([]);

  // Customer search. The chosen customer is not held separately: `form
  // .customer_id` is what gets submitted and `customerSearch` is what the
  // field shows, so a third copy of the same fact had nothing to answer.
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerResults, setCustomerResults] = useState<CustomerListRow[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);

  // Device name, suggested from devices already recorded
  const [deviceNameSearch, setDeviceNameSearch] = useState("");
  const [showDeviceNameDropdown, setShowDeviceNameDropdown] = useState(false);
  const [deviceNameResults, setDeviceNameResults] = useState<Device[]>([]);
  const [searchingDeviceNames, setSearchingDeviceNames] = useState(false);

  // Brand, likewise
  const [brandSearch, setBrandSearch] = useState("");
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [brandResults, setBrandResults] = useState<Device[]>([]);
  const [searchingBrands, setSearchingBrands] = useState(false);

  const [personnelList, setPersonnelList] = useState<Personnel[]>([]);
  const [selectedPersonnel, setSelectedPersonnel] = useState<SelectedPerson[]>(
    [],
  );
  const [personnelSearch, setPersonnelSearch] = useState("");
  const [showPersonnelDropdown, setShowPersonnelDropdown] = useState(false);

  const debouncedCustomerSearch = useDebounce(customerSearch, 300);
  const debouncedDeviceNameSearch = useDebounce(deviceNameSearch, 300);
  const debouncedBrandSearch = useDebounce(brandSearch, 300);

  const filteredPersonnel = personnelList.filter((p) => {
    const alreadySelected = selectedPersonnel.some((s) => s.id === p.id);
    // A personnel row has no `name`: the old `p.name ?? p.full_name` always
    // fell through to the second.
    return !alreadySelected && p.full_name.includes(personnelSearch);
  });

  const searchCustomersAPI = useCallback(async (query: string) => {
    if (!query || query.trim() === "") {
      setCustomerResults([]);
      return;
    }
    setSearchingCustomers(true);
    try {
      const res = await searchCustomers(query);
      setCustomerResults(res.data?.data ?? []);
    } catch (error) {
      console.error("Customer search failed:", error);
      setCustomerResults([]);
    } finally {
      setSearchingCustomers(false);
    }
  }, []);

  // Device names are suggested from devices already recorded rather than a
  // catalogue of their own, so the same name gets spelt the same way twice.
  const searchDeviceNamesAPI = useCallback(async (query: string) => {
    if (!query || query.trim() === "") {
      setDeviceNameResults([]);
      return;
    }
    setSearchingDeviceNames(true);
    try {
      const res = await getDevices({ search: query, limit: 20 });
      const devices = res.data?.data ?? [];
      const uniqueNames = [
        ...new Map(devices.map((d) => [d.device_name, d])).values(),
      ];
      setDeviceNameResults(uniqueNames);
    } catch (error) {
      console.error("Device name search failed:", error);
      setDeviceNameResults([]);
    } finally {
      setSearchingDeviceNames(false);
    }
  }, []);

  const searchBrandsAPI = useCallback(async (query: string) => {
    if (!query || query.trim() === "") {
      setBrandResults([]);
      return;
    }
    setSearchingBrands(true);
    try {
      const res = await getDevices({ search: query, limit: 20 });
      const devices = res.data?.data ?? [];
      const uniqueBrands = [
        ...new Map(
          devices.filter((d) => d.brand).map((d) => [d.brand, d]),
        ).values(),
      ];
      setBrandResults(uniqueBrands);
    } catch (error) {
      console.error("Brand search failed:", error);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, deviceId]);

  useEffect(() => {
    if (customerSearch && customerSearch.trim()) {
      searchCustomersAPI(debouncedCustomerSearch);
    } else {
      setCustomerResults([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedCustomerSearch, searchCustomersAPI]);

  useEffect(() => {
    if (deviceNameSearch && deviceNameSearch.trim()) {
      searchDeviceNamesAPI(debouncedDeviceNameSearch);
    } else {
      setDeviceNameResults([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedDeviceNameSearch, searchDeviceNamesAPI]);

  useEffect(() => {
    if (brandSearch && brandSearch.trim()) {
      searchBrandsAPI(debouncedBrandSearch);
    } else {
      setBrandResults([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedBrandSearch, searchBrandsAPI]);

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setImages([]);
    setSelectedPersonnel([]);
    setCustomerSearch("");
    setDeviceNameSearch("");
    setBrandSearch("");
    setShowNewCustomer(false);
    setShowNewDeviceName(false);
    setShowNewBrand(false);
  };

  const loadPersonnel = async () => {
    try {
      // Not paginated: the endpoint answers with a plain array, so the limit
      // it used to be given had nothing to act on.
      const res = await getPersonnel();
      setPersonnelList(res.data);
    } catch {
      toast.error("خطا در بارگذاری پرسنل");
    }
  };

  const loadDevice = async () => {
    if (!deviceId) return;
    try {
      const [deviceRes, imgRes, assignRes] = await Promise.all([
        getDevice(deviceId),
        getDeviceImages(deviceId),
        getDeviceAssignments(deviceId),
      ]);
      setImages(imgRes.data);
      setSelectedPersonnel(assignRes.data ?? []);
      setForm({
        customer_id: deviceRes.data.customer_id ?? "",
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

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleDateChange =
    (fieldName: keyof DeviceForm) => (gregorianValue: string) =>
      setForm((prev) => ({ ...prev, [fieldName]: gregorianValue ?? "" }));

  const handleAddCustomer = async () => {
    if (!newCustomer.name || !newCustomer.phone)
      return toast.error("نام و شماره تلفن الزامی است");
    try {
      const res = await createCustomer(newCustomer);
      const created = res.data;
      setForm((prev) => ({ ...prev, customer_id: created.id }));
      setShowNewCustomer(false);
      setNewCustomer(INITIAL_CUSTOMER);
      toast.success("مشتری اضافه شد");
      setCustomerSearch(`${created.name} - ${created.phone ?? ""}`);
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

  const handleSelectPersonnel = (person: Personnel) => {
    setSelectedPersonnel((prev) => [
      ...prev,
      { id: person.id, name: person.full_name, username: person.username },
    ]);
    setPersonnelSearch("");
    setShowPersonnelDropdown(false);
  };

  const handleRemovePersonnel = (personId: number) =>
    setSelectedPersonnel((prev) => prev.filter((p) => p.id !== personId));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.device_name.trim()) return toast.error("نام دستگاه الزامی است");
    setLoading(true);
    try {
      let devId: Id | null | undefined = deviceId;
      if (isEdit && deviceId) {
        await updateDevice(deviceId, form as DeviceCreateBody);
        toast.success("دستگاه ویرایش شد");
      } else {
        const res = await createDevice(form as DeviceCreateBody);
        devId = res.data.id;
        toast.success("دستگاه ثبت شد");
      }
      if (devId) {
        await setDeviceAssignments(
          devId,
          selectedPersonnel.map((p) => p.id),
        );
      }
      onSuccess?.();
      onClose();
    } catch (error) {
      const message =
        (axios.isAxiosError(error) &&
          (error.response?.data as { error?: string } | undefined)?.error) ||
        "خطا در ثبت دستگاه";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div
        className="bg-surface rounded-2xl shadow-2xl w-full max-w-5xl my-2 sm:my-8"
        dir="rtl"
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface rounded-t-2xl border-b border-primary-soft px-4 sm:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-primary-soft p-2 rounded-xl">
              <WrenchScrewdriverIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary">
                {isEdit ? `ویرایش دستگاه #${deviceId}` : "ثبت دستگاه جدید"}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-alt rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6">
          {/* Customer and technicians */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Customer */}
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
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-transparent bg-surface text-text-primary"
                    />
                    {showCustomerDropdown && (
                      <div className="absolute z-20 w-full mt-1 bg-surface border border-border rounded-xl shadow-lg max-h-56 overflow-y-auto">
                        <div
                          className="px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-alt cursor-pointer border-b border-border"
                          onMouseDown={() => {
                            setForm((p) => ({ ...p, customer_id: "" }));
                            setCustomerSearch("");
                            setShowCustomerDropdown(false);
                          }}
                        >
                          بدون مشتری
                        </div>
                        {searchingCustomers ? (
                          <div className="px-3 py-4 text-sm text-text-secondary text-center">
                            در حال جستجو...
                          </div>
                        ) : customerResults.length > 0 ? (
                          customerResults.map((c) => (
                            <div
                              key={c.id}
                              onMouseDown={() => {
                                setForm((p) => ({ ...p, customer_id: c.id }));
                                setCustomerSearch(
                                  `${c.name} - ${c.phone || ""}`,
                                );
                                setShowCustomerDropdown(false);
                              }}
                              className="px-3 py-2.5 text-sm hover:bg-primary-soft cursor-pointer border-b border-border"
                            >
                              <div className="font-medium text-text-primary">
                                {c.name}
                              </div>
                              {c.phone && (
                                <div className="text-xs text-text-secondary mt-0.5">
                                  {c.phone}
                                </div>
                              )}
                            </div>
                          ))
                        ) : customerSearch ? (
                          <div className="px-3 py-4 text-xs text-text-secondary text-center">
                            مشتری‌ای یافت نشد
                          </div>
                        ) : (
                          <div className="px-3 py-4 text-xs text-text-secondary text-center">
                            برای جستجو نام یا شماره تلفن وارد کنید
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNewCustomer(true)}
                    className="px-3 py-2 text-sm bg-primary-soft text-primary rounded-xl hover:opacity-80 transition-colors whitespace-nowrap"
                  >
                    + جدید
                  </button>
                </div>

                {showNewCustomer && (
                  <div className="p-4 bg-primary-soft rounded-xl space-y-3 border border-primary-soft">
                    <input
                      placeholder="نام مشتری *"
                      value={newCustomer.name}
                      onChange={(e) =>
                        setNewCustomer((p) => ({ ...p, name: e.target.value }))
                      }
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary bg-surface text-text-primary"
                    />
                    <input
                      placeholder="شماره تلفن *"
                      value={newCustomer.phone}
                      onChange={(e) =>
                        setNewCustomer((p) => ({ ...p, phone: e.target.value }))
                      }
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary bg-surface text-text-primary"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleAddCustomer}
                        className="px-4 py-2 text-sm bg-primary text-text-inverse rounded-lg hover:bg-primary-hover"
                      >
                        ثبت مشتری
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowNewCustomer(false)}
                        className="px-4 py-2 text-sm bg-surface-alt rounded-lg hover:bg-surface-alt text-text-primary"
                      >
                        انصراف
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Technicians */}
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
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary bg-surface text-text-primary"
                  />
                  {showPersonnelDropdown && (
                    <div className="absolute z-20 w-full mt-1 bg-surface border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {filteredPersonnel.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-text-secondary">
                          {personnelList.length === 0
                            ? "پرسنلی ثبت نشده"
                            : "موردی یافت نشد"}
                        </div>
                      ) : (
                        filteredPersonnel.map((person) => (
                          <div
                            key={person.id}
                            onMouseDown={() => handleSelectPersonnel(person)}
                            className="px-3 py-2.5 text-sm hover:bg-primary-soft cursor-pointer flex items-center justify-between text-text-primary"
                          >
                            <span>{person.full_name}</span>
                            {person.username && (
                              <span className="text-xs text-text-secondary">
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
                        className="inline-flex items-center gap-1 px-3 py-1 bg-primary-soft text-primary text-sm rounded-full"
                      >
                        {person.name}
                        <button
                          type="button"
                          onClick={() => handleRemovePersonnel(person.id)}
                          className="text-primary hover:opacity-80 font-bold leading-none"
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

          {/* Device details */}
          <div>
            <SectionTitle icon={CubeIcon} title="اطلاعات دستگاه" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Device name */}
              <div>
                <label className="block font-medium text-text-primary mb-1.5">
                  نام دستگاه <span className="text-danger">*</span>
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
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary bg-surface text-text-primary"
                    />
                    {showDeviceNameDropdown && deviceNameResults.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-surface border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        {searchingDeviceNames ? (
                          <div className="px-3 py-2 text-sm text-text-secondary">
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
                              className="px-3 py-2 text-sm hover:bg-primary-soft cursor-pointer text-text-primary"
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
                    className="px-3 py-2 text-sm bg-primary-soft text-primary rounded-xl hover:opacity-80 transition-colors whitespace-nowrap"
                  >
                    + جدید
                  </button>
                </div>
                {showNewDeviceName && (
                  <div className="mt-2 p-3 bg-primary-soft rounded-xl border border-primary-soft">
                    <input
                      placeholder="نام دستگاه جدید"
                      value={newDeviceName.name}
                      onChange={(e) =>
                        setNewDeviceName({ name: e.target.value })
                      }
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm mb-2 bg-surface text-text-primary"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleAddDeviceName}
                        className="px-3 py-1.5 text-sm bg-primary text-text-inverse rounded-lg hover:bg-primary-hover"
                      >
                        ثبت
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowNewDeviceName(false)}
                        className="px-3 py-1.5 text-sm bg-surface-alt rounded-lg text-text-primary"
                      >
                        انصراف
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Brand */}
              <div>
                <label className="block font-medium text-text-primary mb-1.5">
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
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary bg-surface text-text-primary"
                    />
                    {showBrandDropdown && brandResults.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-surface border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        {searchingBrands ? (
                          <div className="px-3 py-2 text-sm text-text-secondary">
                            در حال جستجو...
                          </div>
                        ) : (
                          brandResults.map((b) => (
                            <div
                              key={b.id}
                              onMouseDown={() => {
                                setForm((p) => ({
                                  ...p,
                                  brand: b.brand ?? "",
                                }));
                                setBrandSearch(b.brand ?? "");
                                setShowBrandDropdown(false);
                              }}
                              className="px-3 py-2 text-sm hover:bg-primary-soft cursor-pointer text-text-primary"
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
                    className="px-3 py-2 text-sm bg-primary-soft text-primary rounded-xl hover:opacity-80 transition-colors whitespace-nowrap"
                  >
                    + جدید
                  </button>
                </div>
                {showNewBrand && (
                  <div className="mt-2 p-3 bg-primary-soft rounded-xl border border-primary-soft">
                    <input
                      placeholder="برند جدید"
                      value={newBrand.name}
                      onChange={(e) => setNewBrand({ name: e.target.value })}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm mb-2 bg-surface text-text-primary"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleAddBrand}
                        className="px-3 py-1.5 text-sm bg-primary text-text-inverse rounded-lg hover:bg-primary-hover"
                      >
                        ثبت
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowNewBrand(false)}
                        className="px-3 py-1.5 text-sm bg-surface-alt rounded-lg text-text-primary"
                      >
                        انصراف
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Model */}
              <div>
                <label className="block font-medium text-text-primary mb-1.5">
                  مدل
                </label>
                <input
                  name="model"
                  value={form.model}
                  onChange={handleChange}
                  placeholder="مثال: Galaxy S21"
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary bg-surface text-text-primary"
                />
              </div>

              {/* Serial number */}
              <div>
                <label className="block font-medium text-text-primary mb-1.5">
                  سریال
                </label>
                <input
                  name="serial_number"
                  value={form.serial_number}
                  onChange={handleChange}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary bg-surface text-text-primary"
                />
              </div>
            </div>
          </div>

          {/* Dates */}
          <div>
            <SectionTitle icon={CalendarIcon} title="تاریخ‌ها" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-text-primary mb-1.5">
                  تاریخ ورود <span className="text-danger">*</span>
                </label>
                <PersianDatePicker
                  value={form.entry_date}
                  onChange={handleDateChange("entry_date")}
                  placeholder="انتخاب تاریخ ورود"
                  required
                />
              </div>
              <div>
                <label className="block font-medium text-text-primary mb-1.5">
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

          {/* Status and description */}
          <div>
            <SectionTitle icon={CheckBadgeIcon} title="وضعیت و توضیحات" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-text-primary mb-1.5">
                  وضعیت
                </label>
                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary bg-surface text-text-primary"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-text-primary mb-1.5">
                  توضیحات
                </label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={7}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary bg-surface text-text-primary"
                  placeholder="توضیحات تعمیرکار ..."
                />
              </div>
            </div>
          </div>

          {/* Images */}
          <div>
            <SectionTitle icon={PhotoIcon} title="عکس‌های دستگاه" />
            <ImageUploader
              deviceId={isEdit ? deviceId : null}
              existingImages={images}
              onDeleteExisting={(imageId) =>
                setImages((imgs) => imgs.filter((i) => i.id !== imageId))
              }
              onUploadDone={(newImgs) =>
                setImages((prev) => [
                  ...prev,
                  ...(newImgs as ListedDeviceImage[]),
                ])
              }
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-2.5 bg-surface-alt text-text-primary rounded-xl hover:bg-surface-alt transition-colors"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto px-6 py-2.5 bg-primary text-text-inverse rounded-xl hover:bg-primary-hover disabled:opacity-50 transition-colors shadow-sm"
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
