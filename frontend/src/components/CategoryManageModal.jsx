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
      <div
        className="bg-surface rounded-xl shadow-xl w-full max-w-lg"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <FolderPlusIcon className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-text-primary">
              مدیریت دسته‌بندی‌ها
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-text-primary hover:bg-surface-alt rounded-lg"
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
              className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim()}
              className="px-4 py-2 bg-primary text-text-inverse rounded-lg hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1 text-sm"
            >
              <PlusIcon className="w-4 h-4" />
              افزودن
            </button>
          </div>

          {/* List */}
          {loading ? (
            <div className="text-center py-8 text-text-secondary">
              در حال بارگذاری...
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-8 text-text-secondary">
              هیچ دسته‌بندی وجود ندارد
            </div>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between p-2 hover:bg-surface-alt rounded-lg"
                >
                  {editTarget?.id === cat.id ? (
                    <div className="flex gap-2 flex-1">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 border border-border rounded px-2 py-1 text-sm bg-surface text-text-primary"
                        autoFocus
                      />
                      <button
                        onClick={handleEdit}
                        disabled={editing}
                        className="px-3 py-1 bg-success text-text-inverse rounded text-xs hover:opacity-80"
                      >
                        ذخیره
                      </button>
                      <button
                        onClick={() => {
                          setEditTarget(null);
                          setEditName("");
                        }}
                        className="px-3 py-1 bg-surface-alt text-text-primary rounded text-xs hover:bg-surface-alt"
                      >
                        انصراف
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-sm text-text-primary">
                        {cat.name}
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setEditTarget(cat);
                            setEditName(cat.name);
                          }}
                          className="p-1.5 rounded text-success hover:opacity-80 transition"
                          title="ویرایش"
                        >
                          <PencilSquareIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(cat)}
                          className="p-1.5 rounded text-danger hover:opacity-80 transition"
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

        <div className="flex justify-end p-4 border-t border-border bg-surface-alt rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-border rounded-lg text-text-primary hover:bg-surface-alt"
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
