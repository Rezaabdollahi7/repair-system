// src/pages/BackupList.jsx
import { useAuth } from "../context/AuthContext";
import { Navigate } from "react-router-dom";
import { ArchiveBoxIcon } from "@heroicons/react/24/solid";

export default function BackupList() {
  const { user } = useAuth();

  if (user?.role !== "super_admin" && user?.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div dir="rtl" className="px-2 sm:px-0">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary flex items-center gap-2">
          <ArchiveBoxIcon className="w-5 h-5 sm:w-6 sm:h-6 text-text-secondary" />
          پشتیبان‌گیری
        </h1>
      </div>

      <div className="bg-surface shadow rounded-lg p-6 sm:p-10 text-center">
        <ArchiveBoxIcon className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-text-secondary" />

        <h2 className="text-base sm:text-lg font-bold text-text-primary mb-3">
          نگهداری اطلاعات بر عهده سرویس است
        </h2>

        <p className="text-xs sm:text-sm text-text-secondary leading-7 max-w-lg mx-auto">
          از این پس پشتیبان‌گیری از اطلاعات به‌صورت خودکار و منظم توسط سرویس
          انجام می‌شود و نیازی به اقدام شما نیست.
        </p>

        <p className="text-xs sm:text-sm text-text-secondary leading-7 max-w-lg mx-auto mt-3">
          امکان دریافت خروجی از اطلاعات کارگاه شما — شامل مشتریان، دستگاه‌ها،
          کالاها و فاکتورها در قالب فایل اکسل به‌همراه تصاویر دستگاه‌ها — در
          نسخه‌های بعدی اضافه خواهد شد.
        </p>
      </div>
    </div>
  );
}
