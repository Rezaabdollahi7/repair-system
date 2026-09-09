import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { backdrop, modalPanel } from "../motion";

type ConfirmVariant = "danger" | "warning" | "info";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  loading?: boolean;
}

/**
 * The confirmation dialog behind every destructive action in the app.
 *
 * Its buttons take the -fill tones rather than the base ones. The base
 * status colours are for dots, bars and badge borders; white on #f59e0b is
 * 2.1:1, so the "غیرفعال کن" button was unreadable in the light theme.
 */
const VARIANTS: Record<ConfirmVariant, { icon: string; button: string }> = {
  danger: {
    icon: "text-danger-fg bg-danger-soft",
    button: "bg-danger-fill text-on-status",
  },
  warning: {
    icon: "text-warning-fg bg-warning-soft",
    button: "bg-warning-fill text-on-status",
  },
  info: {
    icon: "text-primary bg-primary-soft",
    button: "bg-primary text-primary-fg",
  },
};

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "تأیید عملیات",
  message = "آیا از انجام این عملیات مطمئن هستید؟",
  confirmText = "تأیید",
  cancelText = "انصراف",
  variant = "danger",
  loading = false,
}: ConfirmModalProps) {
  // Escape closes it, unless a request is already in flight — cancelling the
  // dialog while the delete is running would hide what is happening without
  // stopping it.
  useEffect(() => {
    if (!isOpen || loading) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, loading, onClose]);

  const style = VARIANTS[variant];

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <motion.div
            variants={backdrop}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={loading ? undefined : onClose}
            className="absolute inset-0 bg-scrim/50"
          />

          <motion.div
            variants={modalPanel}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative bg-surface border border-border rounded-panel w-full max-w-md shadow-xl"
            dir="rtl"
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
              <h3 className="text-title-sm font-bold text-text-primary">
                {title}
              </h3>
              <button
                onClick={onClose}
                disabled={loading}
                aria-label="بستن"
                className="p-1.5 rounded-field text-text-secondary hover:text-text-primary
                           hover:bg-surface-alt transition-colors cursor-pointer
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              <div className="flex items-start gap-4">
                <span
                  className={`shrink-0 w-11 h-11 rounded-field flex items-center justify-center ${style.icon}`}
                >
                  <ExclamationTriangleIcon className="w-6 h-6" />
                </span>
                {/* whitespace-pre-line: several callers put a second
                    sentence after a \n — "موجودی کالاها به حالت قبل
                    برمی‌گردد" was running onto the first. */}
                <p className="text-body-sm text-text-primary whitespace-pre-line">
                  {message}
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end px-5 py-4 border-t border-border bg-surface-alt rounded-b-card">
              <button
                onClick={onClose}
                disabled={loading}
                // bg-surface, not transparent: the footer is --surface-alt and
                // --border is the same value in the dark theme, so a
                // transparent button here had an invisible outline.
                className="px-4 py-2.5 rounded-field border border-border bg-surface text-body-sm
                           font-bold text-text-primary hover:border-border-strong transition-colors
                           cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                aria-busy={loading}
                className={`px-4 py-2.5 rounded-field text-body-sm font-bold transition-colors
                            flex items-center gap-2 cursor-pointer
                            disabled:opacity-60 disabled:cursor-not-allowed ${style.button}`}
              >
                {loading && (
                  <span
                    aria-hidden
                    className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin"
                  />
                )}
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
