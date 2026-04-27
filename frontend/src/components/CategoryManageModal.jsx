// src/components/CategoryManageModal.jsx
import { useState, useEffect } from "react";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../api";
import toast from "react-hot-toast";
import {
  XMarkIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  FolderPlusIcon,
} from "@heroicons/react/24/solid";
import ConfirmModal from "./ConfirmModal";

export default function CategoryManageModal({ isOpen, onClose, onSuccess }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editName, setEditName] = useState("");
  const [editing, setEditing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchCategories();
      setNewName("");
      setEditTarget(null);
    }
  }, [isOpen]);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const res = await getCategories();
      setCategories(res.data?.data || res.data || []);
    } catch {
      toast.error("خطا در دریافت دسته‌بندی‌ها");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return toast.error("نام دسته‌بندی الزامی است");
    setAdding(true);
    try {
      await createCategory({ name: newName.trim() });
      toast.success("دسته‌بندی جدید اضافه شد");
      setNewName("");
      fetchCategories();
      onSuccess && onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.error || "خطا در ایجاد دسته‌بندی");
    } finally {
      setAdding(false);
    }
  };

  const handleEdit = async () => {
    if (!editName.trim()) return toast.error("نام دسته‌بندی الزامی است");
    setEditing(true);
    try {
      await updateCategory(editTarget.id, { name: editName.trim() });
      toast.success("دسته‌بندی ویرایش شد");
      setEditTarget(null);
      setEditName("");
      fetchCategories();
      onSuccess && onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.error || "خطا در ویرایش");
    } finally {
      setEditing(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCategory(deleteTarget.id);
      toast.success("دسته‌بندی حذف شد");
      setDeleteTarget(null);
      fetchCategories();
      onSuccess && onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.error || "خطا در حذف");
    } finally {
      setDeleting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (editTarget) handleEdit();
      else handleAdd();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <FolderPlusIcon className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-gray-900">
              مدیریت دسته‌بندی‌ها
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Add New */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="نام دسته‌بندی جدید..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1 text-sm"
            >
              <PlusIcon className="w-4 h-4" />
              افزودن
            </button>
          </div>

          {/* List */}
          {loading ? (
            <div className="text-center py-8 text-gray-500">
              در حال بارگذاری...
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              هیچ دسته‌بندی وجود ندارد
            </div>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg"
                >
                  {editTarget?.id === cat.id ? (
                    <div className="flex gap-2 flex-1">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                        autoFocus
                      />
                      <button
                        onClick={handleEdit}
                        disabled={editing}
                        className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                      >
                        ذخیره
                      </button>
                      <button
                        onClick={() => {
                          setEditTarget(null);
                          setEditName("");
                        }}
                        className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
                      >
                        انصراف
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-sm text-gray-700">{cat.name}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setEditTarget(cat);
                            setEditName(cat.name);
                          }}
                          className="p-1.5 rounded text-green-600 hover:bg-green-50 transition"
                          title="ویرایش"
                        >
                          <PencilSquareIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(cat)}
                          className="p-1.5 rounded text-red-600 hover:bg-red-50 transition"
                          title="حذف"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            بستن
          </button>
        </div>
      </div>

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف دسته‌بندی"
        message={`آیا از حذف دسته‌بندی "${deleteTarget?.name}" مطمئن هستید؟`}
        confirmText="حذف"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
