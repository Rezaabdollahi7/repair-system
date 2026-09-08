import { useRef, useState, useEffect, useCallback } from "react";
import axios from "axios";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";
import api, { deleteDeviceImage } from "../api";
import {
  TrashIcon,
  PhotoIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import ImageSlider from "./ImageSlider";
import ConfirmModal from "./ConfirmModal";
import { scaleIn, transition } from "../motion";
import { secondaryButton } from "../utils/tableClasses";
import type { DeviceImage, Id, UploadImagesResponse } from "../types/api";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

/**
 * queued   — chosen before the device exists, waiting for its id
 * uploading — bytes on the wire, progress is real
 * processing — sent in full, the server is converting to webp
 */
type QueueStatus = "queued" | "uploading" | "processing" | "done" | "error";

interface QueueItem {
  id: string;
  file: File;
  previewUrl: string;
  status: QueueStatus;
  progress: number;
  error: string | null;
}

interface ImageUploaderProps {
  deviceId?: Id | null;
  existingImages?: DeviceImage[];
  onDeleteExisting: (imageId: number) => void;
  onUploadDone?: (images: DeviceImage[]) => void;
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function ImageUploader({
  deviceId,
  existingImages = [],
  onDeleteExisting,
  onUploadDone,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sliderIndex, setSliderIndex] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeviceImage | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Dragging is counted rather than flagged: dragleave fires as the pointer
  // crosses onto a child element, so a boolean flickers the highlight off
  // the moment the cursor passes over a thumbnail inside the zone.
  const [dragDepth, setDragDepth] = useState(0);
  // Images chosen but not yet uploaded and stored.
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const abortControllers = useRef<Record<string, AbortController>>({});

  // Uploaded one at a time so each image reports its own progress.
  const uploadOne = useCallback(
    async (item: QueueItem) => {
      const controller = new AbortController();
      abortControllers.current[item.id] = controller;

      setQueue((q) =>
        q.map((i) =>
          i.id === item.id
            ? { ...i, status: "uploading", progress: 0, error: null }
            : i,
        ),
      );

      try {
        const formData = new FormData();
        formData.append("images", item.file);

        const res = await api.post<UploadImagesResponse>(
          `/devices/${deviceId}/images`,
          formData,
          {
            headers: { "Content-Type": "multipart/form-data" },
            signal: controller.signal,
            onUploadProgress: (evt) => {
              if (!evt.total) return;
              const pct = Math.round((evt.loaded * 100) / evt.total);
              setQueue((q) =>
                q.map((i) =>
                  i.id === item.id
                    ? {
                        ...i,
                        progress: pct,
                        // Sent in full but no answer yet: the server is
                        // converting the file.
                        status: pct >= 100 ? "processing" : "uploading",
                      }
                    : i,
                ),
              );
            },
          },
        );

        const uploadedImage = res.data?.images?.[0];

        setQueue((q) =>
          q.map((i) => (i.id === item.id ? { ...i, status: "done" } : i)),
        );

        if (uploadedImage && onUploadDone) {
          onUploadDone([uploadedImage]);
        }

        // Dropped from the queue after the tick has been visible for a
        // moment: from here the parent shows it through existingImages.
        setTimeout(() => {
          setQueue((q) => q.filter((i) => i.id !== item.id));
          URL.revokeObjectURL(item.previewUrl);
        }, 700);
      } catch (err) {
        if (axios.isCancel(err)) {
          // Cancelled by the user; there is nothing to report.
          return;
        }
        const message =
          (axios.isAxiosError(err) &&
            (err.response?.data as { error?: string } | undefined)?.error) ||
          "خطا در آپلود عکس";
        setQueue((q) =>
          q.map((i) =>
            i.id === item.id ? { ...i, status: "error", error: message } : i,
          ),
        );
        toast.error(message);
      } finally {
        delete abortControllers.current[item.id];
      }
    },
    [deviceId, onUploadDone],
  );

  // Shared by the file input and by a drop, so both paths get the same size
  // check and the same queueing behaviour.
  function addFiles(files: File[]) {
    const oversized = files.filter((f) => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      toast.error(`${oversized.length} فایل بیش از ۱۵ مگابایت است`);
    }

    const validFiles = files.filter((f) => f.size <= MAX_FILE_SIZE);
    if (validFiles.length === 0) return;

    const newItems: QueueItem[] = validFiles.map((file) => ({
      id: makeId(),
      file,
      previewUrl: URL.createObjectURL(file),
      // Without a device id there is nowhere to put the file yet, so it
      // waits in the queue until the form has been saved.
      status: deviceId ? "uploading" : "queued",
      progress: 0,
      error: null,
    }));

    setQueue((q) => [...q, ...newItems]);

    if (deviceId) {
      newItems.forEach((item) => uploadOne(item));
    }
  }

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = ""; // so the same file can be chosen again
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragDepth(0);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length === 0) return;
    addFiles(files);
  }

  // Once the new device has an id, anything waiting goes up on its own.
  useEffect(() => {
    if (!deviceId) return;
    setQueue((currentQueue) => {
      const stillQueued = currentQueue.filter((i) => i.status === "queued");
      stillQueued.forEach((item) => uploadOne(item));
      return currentQueue;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  // On unmount: abort what is in flight and release the object URLs.
  useEffect(() => {
    return () => {
      Object.values(abortControllers.current).forEach((c) => c.abort());
      queue.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function retryUpload(item: QueueItem) {
    uploadOne(item);
  }

  function removeQueueItem(item: QueueItem) {
    const controller = abortControllers.current[item.id];
    if (controller) controller.abort();
    setQueue((q) => q.filter((i) => i.id !== item.id));
    URL.revokeObjectURL(item.previewUrl);
  }

  async function handleDelete() {
    // Unreachable in practice — the delete button only exists on images the
    // device already has — but narrowing it here is honest, where `?? ""`
    // would only quiet the type.
    if (!deviceId || !deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDeviceImage(deviceId, deleteTarget.id);
      toast.success("عکس حذف شد");
      onDeleteExisting(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      toast.error("خطا در حذف عکس");
    } finally {
      setDeleting(false);
    }
  }

  const hasQueuedWaitingForDevice =
    !deviceId && queue.some((i) => i.status === "queued");

  const isDragging = dragDepth > 0;
  const tiles = existingImages.length + queue.length;

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        setDragDepth((d) => d + 1);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setDragDepth((d) => Math.max(0, d - 1))}
      onDrop={handleDrop}
      className={`relative bg-surface border rounded-card p-5 space-y-4 transition-colors ${
        isDragging ? "border-primary bg-primary-soft" : "border-border"
      }`}
    >
      {/*
        A full-cover hint rather than a separate drop target: the whole card
        already accepts the drop, so drawing a second zone inside it would
        invite aiming at the smaller one.
      */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            variants={scaleIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute inset-0 z-10 rounded-card border-2 border-dashed border-primary
                       bg-primary-soft/90 flex flex-col items-center justify-center gap-2
                       pointer-events-none"
          >
            <ArrowUpTrayIcon className="w-8 h-8 text-primary" />
            <span className="text-body-sm font-bold text-primary">
              عکس‌ها را اینجا رها کنید
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {tiles > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {/* Already stored */}
          <AnimatePresence initial={false}>
            {existingImages.map((img, i) => (
              <motion.div
                key={`existing-${img.id}`}
                layout
                variants={scaleIn}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="relative group rounded-field overflow-hidden border border-border"
              >
                <img
                  // The grid cell is 112px tall; the full image is 3400px
                  // wide. The slider still opens the full one on click.
                  src={img.thumbnail_url ?? img.url}
                  alt={`عکس ${i + 1}`}
                  onClick={() => setSliderIndex(i)}
                  className="w-full h-28 object-cover cursor-pointer transition-transform
                             duration-300 group-hover:scale-105"
                />
                {/* A wash under the delete button, so it stays legible over
                    a pale photo without darkening the whole thumbnail. */}
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-scrim/45 to-transparent
                             opacity-0 group-hover:opacity-100 transition-opacity"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(img);
                  }}
                  aria-label={`حذف عکس ${i + 1}`}
                  className="absolute top-2 left-2 bg-danger-fill text-on-status p-1.5 rounded-field
                             opacity-0 group-hover:opacity-100 focus-visible:opacity-100
                             transition-opacity hover:opacity-90 cursor-pointer"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </motion.div>
            ))}

            {/* Queued, uploading, or failed */}
            {queue.map((item) => (
              <motion.div
                key={item.id}
                layout
                variants={scaleIn}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="relative rounded-field overflow-hidden border border-border"
              >
                <img
                  src={item.previewUrl}
                  alt=""
                  className={`w-full h-28 object-cover transition-opacity ${
                    item.status === "queued" ? "opacity-50" : "opacity-90"
                  }`}
                />

                {/*
                  Status overlay. Its text takes --on-dark rather than
                  --text-inverse: the scrim stays dark in both themes, while
                  --text-inverse follows the page and would go near-black
                  here under the dark theme.
                */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-scrim/50 text-on-dark text-center px-2">
                  {item.status === "queued" && (
                    <>
                      <ClockIcon className="w-5 h-5" />
                      <span className="text-[10px] leading-tight">
                        پس از ذخیره دستگاه آپلود می‌شود
                      </span>
                    </>
                  )}

                  {item.status === "uploading" && (
                    <>
                      <ArrowPathIcon className="w-5 h-5 animate-spin" />
                      <span className="text-[11px]">
                        در حال آپلود... {item.progress}%
                      </span>
                      <div className="w-4/5 h-1 bg-on-dark/25 rounded-pill overflow-hidden">
                        <motion.div
                          className="h-full bg-on-dark"
                          animate={{ width: `${item.progress}%` }}
                          transition={transition.fast}
                        />
                      </div>
                    </>
                  )}

                  {item.status === "processing" && (
                    <>
                      <ArrowPathIcon className="w-5 h-5 animate-spin" />
                      <span className="text-[11px]">در حال تبدیل فرمت...</span>
                    </>
                  )}

                  {item.status === "done" && (
                    <motion.span
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={transition.base}
                    >
                      <CheckCircleIcon className="w-8 h-8 text-success" />
                    </motion.span>
                  )}

                  {item.status === "error" && (
                    <>
                      <ExclamationTriangleIcon className="w-5 h-5 text-danger" />
                      <span className="text-[10px] leading-tight">
                        {item.error || "خطا در آپلود"}
                      </span>
                      <button
                        type="button"
                        onClick={() => retryUpload(item)}
                        className="mt-1 bg-on-dark/20 hover:bg-on-dark/30 rounded-field px-2 py-0.5
                                   text-[10px] text-on-dark cursor-pointer transition-colors"
                      >
                        تلاش مجدد
                      </button>
                    </>
                  )}
                </div>

                {/* Removable until the upload has finished */}
                {item.status !== "done" && (
                  <button
                    type="button"
                    onClick={() => removeQueueItem(item)}
                    className="absolute top-2 left-2 bg-danger-fill text-on-status p-1.5 rounded-field
                               hover:opacity-90 transition-opacity cursor-pointer"
                    title="حذف"
                    aria-label="حذف از صف"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={secondaryButton}
        >
          <PhotoIcon className="w-5 h-5" />
          <span>انتخاب عکس</span>
        </button>

        <span className="text-body-xs text-text-muted hidden sm:inline">
          یا فایل‌ها را داخل این کادر بکشید — حداکثر ۱۵ مگابایت برای هر عکس
        </span>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          hidden
          onChange={handleSelect}
        />
      </div>

      {!deviceId && (
        <p className="text-body-xs text-text-secondary">
          {hasQueuedWaitingForDevice
            ? "عکس‌ها انتخاب شدند. پس از ذخیره‌ی دستگاه، خودکار و در پس‌زمینه آپلود می‌شوند."
            : "بعد از ثبت دستگاه می‌توانید عکس‌ها را آپلود کنید"}
        </p>
      )}

      <AnimatePresence>
        {sliderIndex !== null && (
          <ImageSlider
            images={existingImages}
            initialIndex={sliderIndex}
            onClose={() => setSliderIndex(null)}
          />
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="حذف عکس"
        message="این عکس برای همیشه حذف می‌شود. مطمئن هستید؟"
        confirmText="حذف"
      />
    </div>
  );
}
