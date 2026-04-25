import { useRef } from "react";
import toast from "react-hot-toast";
import { uploadDeviceImages, deleteDeviceImage } from "../api";
import { TrashIcon, PhotoIcon } from "@heroicons/react/24/outline";

export default function ImageUploader({
  deviceId,
  existingImages = [],
  pendingFiles = [],
  onPendingChange,
  onDeleteExisting,
  onUploadDone,
}) {
  const inputRef = useRef();

  function handleSelect(e) {
    const files = Array.from(e.target.files);
    const oversized = files.filter((f) => f.size > 15 * 1024 * 1024);
    if (oversized.length > 0) {
      toast.error(`${oversized.length} فایل بیش از ۱۵ مگابایت است`);
      return;
    }
    onPendingChange([...pendingFiles, ...files]);
  }

  function removePending(index) {
    const updated = [...pendingFiles];
    updated.splice(index, 1);
    onPendingChange(updated);
  }

  async function uploadNow() {
    if (!deviceId || pendingFiles.length === 0) return;
    try {
      const res = await uploadDeviceImages(deviceId, pendingFiles);
      toast.success("عکس‌ها آپلود شدند");
      onPendingChange([]);
      if (onUploadDone) onUploadDone(res.data.images);
    } catch {
      toast.error("خطا در آپلود عکس");
    }
  }

  async function handleDelete(imageId) {
    if (!confirm("حذف این عکس؟")) return;
    try {
      await deleteDeviceImage(deviceId, imageId);
      toast.success("عکس حذف شد");
      onDeleteExisting(imageId);
    } catch {
      toast.error("خطا در حذف عکس");
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      {/* <h2 className="font-semibold text-gray-700">📷 عکس‌های دستگاه</h2> */}

      {existingImages.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {existingImages.map((img) => (
            <div key={img.id} className="relative group">
              <img
                src={`http://localhost:5001/uploads/devices/${img.filename}`}
                className="w-full h-28 object-cover rounded-lg border"
              />
              <button
                type="button"
                onClick={() => handleDelete(img.id)}
                className="absolute top-2 left-2 bg-red-600 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100"
              >
                <TrashIcon className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {pendingFiles.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {pendingFiles.map((file, i) => (
            <div key={i} className="relative">
              <img
                src={URL.createObjectURL(file)}
                className="w-full h-28 object-cover rounded-lg border opacity-70"
              />
              <button
                type="button"
                onClick={() => removePending(i)}
                className="absolute top-2 left-2 bg-red-500 text-white text-xs px-2 py-1 rounded"
              >
                <TrashIcon className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => inputRef.current.click()}
          className="px-4 py-2 flex gap-2 justify-center items-center bg-gray-100 rounded-lg hover:bg-gray-200 "
        >
          <PhotoIcon className="w-5 h-5" />
          <span>انتخاب عکس</span>
        </button>

        {deviceId && pendingFiles.length > 0 && (
          <button
            type="button"
            onClick={uploadNow}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
          >
            آپلود
          </button>
        )}

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
        <p className="text-xs text-gray-500">
          بعد از ثبت دستگاه می‌توانید عکس‌ها را آپلود کنید
        </p>
      )}
    </div>
  );
}
