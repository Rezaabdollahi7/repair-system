import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { getDevices, deleteDevice } from "../api";
import toast from "react-hot-toast";

function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function DeviceList() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");

  const debouncedSearch = useDebounce(searchInput, 400);

  const fetchDevices = useCallback(async (searchTerm) => {
    setLoading(true);
    try {
      const params = searchTerm ? { search: searchTerm } : {};
      const res = await getDevices(params);
      setDevices(res.data);
    } catch {
      toast.error("خطا در دریافت لیست دستگاه‌ها");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices(debouncedSearch);
  }, [debouncedSearch, fetchDevices]);

  const handleDelete = async (id) => {
    if (!confirm("آیا مطمئن هستید؟")) return;
    try {
      await deleteDevice(id);
      toast.success("دستگاه حذف شد");
      fetchDevices(debouncedSearch);
    } catch {
      toast.error("خطا در حذف دستگاه");
    }
  };

  function formatDate(dateStr) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("fa-IR");
  }

  return (
    <div dir="rtl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">دستگاه‌ها</h1>
        <Link
          to="/devices/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          ثبت دستگاه جدید
        </Link>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="جستجو در نام، برند، مدل، سریال، مشتری، شماره تماس..."
          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-500">
          در حال بارگذاری...
        </div>
      ) : devices.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          {searchInput
            ? `نتیجه‌ای برای "${searchInput}" یافت نشد`
            : "هیچ دستگاهی ثبت نشده"}
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  شماره پذیرش
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  نوع دستگاه
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  مشتری
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  شماره تماس
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  وضعیت
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  تاریخ ثبت
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {devices.map((device) => (
                <tr key={device.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono">
                    {device.reception_number ?? device.id}
                  </td>
                  <td className="px-4 py-3 text-sm">{device.device_name}</td>
                  <td className="px-4 py-3 text-sm">
                    {device.customer_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {device.customer_phone ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={device.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatDate(device.created_at)}
                  </td>
                  <td className="px-4 py-3 text-sm flex gap-2 justify-end">
                    <Link
                      to={`/devices/${device.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      جزئیات
                    </Link>
                    <Link
                      to={`/devices/${device.id}/edit`}
                      className="text-yellow-600 hover:underline"
                    >
                      ویرایش
                    </Link>
                    <button
                      onClick={() => handleDelete(device.id)}
                      className="text-red-600 hover:underline"
                    >
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending: { label: "در انتظار", color: "bg-yellow-100 text-yellow-800" },
    in_progress: { label: "در حال تعمیر", color: "bg-blue-100 text-blue-800" },
    done: { label: "تعمیر شده", color: "bg-green-100 text-green-800" },
    delivered: { label: "تحویل داده شده", color: "bg-gray-100 text-gray-800" },
  };
  const s = map[status] ?? {
    label: status,
    color: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${s.color}`}>
      {s.label}
    </span>
  );
}
