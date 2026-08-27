import { useRef, useState, useEffect, useCallback } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import api, { deleteDeviceImage } from "../api";
import {
  TrashIcon,
  PhotoIcon,
  ArrowPathIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import ImageSlider from "./ImageSlider";
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

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // so the same file can be chosen again

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

  async function handleDelete(imageId: number) {
    // Unreachable in practice — the delete button only exists on images the
    // device already has — but narrowing it here is honest, where `?? ""`
    // would only quiet the type.
    if (!deviceId) return;
    if (!confirm("حذف این عکس؟")) return;
    try {
      await deleteDeviceImage(deviceId, imageId);
      toast.success("عکس حذف شد");
      onDeleteExisting(imageId);
    } catch {
      toast.error("خطا در حذف عکس");
    }
  }

  const hasQueuedWaitingForDevice =
    !deviceId && queue.some((i) => i.status === "queued");

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
      {(existingImages.length > 0 || queue.length > 0) && (
        <div className="grid grid-cols-3 gap-3">
          {/* Already stored */}
          {existingImages.map((img, i) => (
            <div key={`existing-${img.id}`} className="relative group">
              <img
                // The grid cell is 112px tall; the full image is 3400px wide.
                // The slider still opens the full one on click.
                src={img.thumbnail_url ?? img.url}
                alt={`عکس ${i + 1}`}
                onClick={() => setSliderIndex(i)}
                className="w-full h-28 object-cover rounded-lg border cursor-pointer hover:opacity-80 transition"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(img.id);
                }}
                className="absolute top-2 left-2 bg-danger text-text-inverse text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <TrashIcon className="w-5 h-5" />
              </button>
            </div>
          ))}

          {/* Queued, uploading, or failed */}
          {queue.map((item) => (
            <div key={item.id} className="relative">
              <img
                src={item.previewUrl}
                className={`w-full h-28 object-cover rounded-lg border transition-opacity ${
                  item.status === "queued" ? "opacity-50" : "opacity-90"
                }`}
              />

              {/* Status overlay */}
              <div className="absolute inset-0 rounded-lg flex flex-col items-center justify-center gap-1 bg-black/45 text-text-inverse text-center px-2">
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
                    <div className="w-4/5 h-1 bg-surface/30 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-surface transition-all"
                        style={{ width: `${item.progress}%` }}
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
                  <CheckCircleIcon className="w-7 h-7 text-success" />
                )}

                {item.status === "error" && (
                  <>
                    <ExclamationTriangleIcon className="w-5 h-5 text-danger" />
                    <span className="text-[10px] leading-tight">
                      {item.error || "خطا در آپلود"}
                    </span>
                    <div className="flex gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => retryUpload(item)}
                        className="bg-surface/20 hover:bg-surface/30 rounded px-2 py-0.5 text-[10px] text-text-inverse"
                      >
                        تلاش مجدد
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Removable until the upload has finished */}
              {item.status !== "done" && (
                <button
                  type="button"
                  onClick={() => removeQueueItem(item)}
                  className="absolute top-2 left-2 bg-danger text-text-inverse text-xs p-1 rounded"
                  title="حذف"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="px-4 py-2 flex gap-2 justify-center items-center bg-surface-alt rounded-lg hover:bg-surface-alt"
        >
          <PhotoIcon className="w-5 h-5" />
          <span>انتخاب عکس</span>
        </button>

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
        <p className="text-xs text-text-secondary">
          {hasQueuedWaitingForDevice
            ? "عکس‌ها انتخاب شدند. پس از ذخیره‌ی دستگاه، خودکار و در پس‌زمینه آپلود می‌شوند."
            : "بعد از ثبت دستگاه می‌توانید عکس‌ها را آپلود کنید"}
        </p>
      )}

      {sliderIndex !== null && (
        <ImageSlider
          images={existingImages}
          initialIndex={sliderIndex}
          onClose={() => setSliderIndex(null)}
        />
      )}
    </div>
  );
}
