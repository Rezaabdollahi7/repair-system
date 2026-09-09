import { useEffect, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  XMarkIcon,
  PrinterIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/solid";
import { backdrop, modalPanel } from "../motion";

interface PrintPreviewModalProps {
  title: string;
  onPrint: () => void;
  onClose: () => void;
  /** Width of the shell, so an A5 landscape sheet is not shown in an A4 box. */
  maxWidth?: string;
  /** Shown under the title — the paper size, a caveat about browser headers. */
  note?: ReactNode;
  /**
   * Whether to offer the second button. It prints too: the browser's own
   * dialog has "Save as PDF", so this is the same action under the name
   * people look for. The receipt says so on one button instead.
   */
  showPdfButton?: boolean;
  children: ReactNode;
}

/**
 * The chrome around a printable document.
 *
 * The three previews — repair invoice, sale invoice, payment receipt — each
 * carried their own copy of this header, and each copy had drifted: two
 * offered a PDF button and one folded it into the print button, and all
 * three still used the pre-redesign `rounded-lg` and raw type sizes. None
 * of them closed on Escape.
 *
 * Only the chrome lives here. The sheet itself stays in each component,
 * because a repair invoice and a thermal receipt have nothing in common
 * below this line.
 */
export default function PrintPreviewModal({
  title,
  onPrint,
  onClose,
  maxWidth = "56rem",
  note,
  showPdfButton = true,
  children,
}: PrintPreviewModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <motion.div
      variants={backdrop}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={onClose}
      className="fixed inset-0 bg-scrim/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
    >
      <motion.div
        variants={modalPanel}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth }}
        className="bg-surface border border-border rounded-panel shadow-xl w-full
                   max-h-[90vh] overflow-hidden flex flex-col"
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-title-sm font-bold text-text-primary">
              {title}
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPrint}
                className="px-3.5 py-2 rounded-field bg-primary text-primary-fg text-body-sm font-bold
                           shadow-primary hover:bg-primary-hover transition-colors
                           flex items-center gap-1.5 cursor-pointer"
              >
                <PrinterIcon className="w-4 h-4" />
                {showPdfButton ? "چاپ" : "چاپ / PDF"}
              </button>

              {showPdfButton && (
                <button
                  type="button"
                  onClick={onPrint}
                  className="px-3.5 py-2 rounded-field bg-success-fill text-on-status text-body-sm font-bold
                             hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowDownTrayIcon className="w-4 h-4" />
                  PDF
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                aria-label="بستن"
                className="p-2 rounded-field text-text-secondary hover:text-text-primary
                           hover:bg-surface-alt transition-colors cursor-pointer"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
          {note}
        </div>

        {/* The sheet sits on the sunken surface, so the white page reads as
            paper laid on a desk rather than as more of the modal. */}
        <div className="flex-1 overflow-y-auto bg-surface-sunken p-4 sm:p-6">
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}
