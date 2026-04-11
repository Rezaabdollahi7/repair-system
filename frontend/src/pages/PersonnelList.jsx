import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  getPersonnel,
  deletePersonnel,
  togglePersonnelActive,
} from "../api/index";
import { useAuth } from "../context/AuthContext";

export default function PersonnelList() {
  const { user } = useAuth();
  const [personnel, setPersonnel] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPersonnel = async () => {
    try {
      const res = await getPersonnel();
      setPersonnel(res.data);
    } catch {
      toast.error("خطا در دریافت لیست پرسنل");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPersonnel();
  }, []);

  const handleToggleActive = async (id) => {
    try {
      await togglePersonnelActive(id);
      toast.success("وضعیت تغییر کرد");
      fetchPersonnel();
    } catch {
      toast.error("خطا در تغییر وضعیت");
    }
  };

  const handleDelete = async (id, fullName) => {
    if (!confirm(`آیا از حذف "${fullName}" مطمئن هستید؟`)) return;
    try {
      await deletePersonnel(id);
      toast.success("پرسنل حذف شد");
      fetchPersonnel();
    } catch (err) {
      toast.error(err.response?.data?.error || "خطا در حذف پرسنل");
    }
  };

  const canManage =
    user?.role_name === "super_admin" || user?.role_name === "admin";
  const canDelete = user?.role_name === "super_admin";

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <p className="text-gray-500">در حال بارگذاری...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">مدیریت پرسنل</h1>
        {canManage && (
          <Link
            to="/personnel/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            + افزودن پرسنل
          </Link>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                نام
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                نام کاربری
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                نقش
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                تلفن
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                وضعیت
              </th>
              {canManage && (
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  عملیات
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {personnel.length === 0 ? (
              <tr>
                <td
                  colSpan={canManage ? 6 : 5}
                  className="px-6 py-10 text-center text-gray-400"
                >
                  پرسنلی ثبت نشده است
                </td>
              </tr>
            ) : (
              personnel.map((person) => (
                <tr key={person.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                        {person.full_name?.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {person.full_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                    {person.username}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        person.role_name === "super_admin"
                          ? "bg-purple-100 text-purple-700"
                          : person.role_name === "admin"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {person.role_label}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {person.phone || "—"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        person.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {person.is_active ? "فعال" : "غیرفعال"}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-3">
                        <Link
                          to={`/personnel/${person.id}/edit`}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          ویرایش
                        </Link>
                        {person.id !== user?.id && (
                          <button
                            onClick={() => handleToggleActive(person.id)}
                            className="text-yellow-600 hover:text-yellow-800 font-medium"
                          >
                            {person.is_active ? "غیرفعال" : "فعال‌سازی"}
                          </button>
                        )}
                        {canDelete && person.id !== user?.id && (
                          <button
                            onClick={() =>
                              handleDelete(person.id, person.full_name)
                            }
                            className="text-red-600 hover:text-red-800 font-medium"
                          >
                            حذف
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
