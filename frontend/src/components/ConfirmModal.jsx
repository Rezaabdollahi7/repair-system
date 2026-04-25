// src/components/ConfirmModal.jsx
import { ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/24/solid";

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "تأیید عملیات",
  message = "آیا از انجام این عملیات مطمئن هستید؟",
  confirmText = "تأیید",
  cancelText = "انصراف",
  variant = "danger", // danger, warning, info
  loading = false,
}) {
  const variantStyles = {
    danger: {
      icon: "text-red-600 bg-red-100",
      button: "bg-red-600 hover:bg-red-700 text-white",
    },
    warning: {
      icon: "text-yellow-600 bg-yellow-100",
      button: "bg-yellow-600 hover:bg-yellow-700 text-white",
    },
    info: {
      icon: "text-blue-600 bg-blue-100",
      button: "bg-blue-600 hover:bg-blue-700 text-white",
    },
  };

  const style = variantStyles[variant];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md shadow-xl" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-full flex-shrink-0 ${style.icon}`}>
              <ExclamationTriangleIcon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-gray-700 text-sm leading-relaxed">{message}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 justify-end p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 ${style.button}`}
          >
            {loading && (
              <svg
                className="animate-spin h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
