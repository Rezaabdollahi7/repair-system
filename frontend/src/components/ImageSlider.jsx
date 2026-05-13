// src/components/ImageSlider.jsx
import { useState, useEffect, useCallback } from "react";
import {
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { getImageUrl } from "../utils/helpers";

export default function ImageSlider({ images, initialIndex = 0, onClose }) {
  const [current, setCurrent] = useState(initialIndex);

  const prev = useCallback(() => {
    setCurrent((i) => (i === 0 ? images.length - 1 : i - 1));
  }, [images.length]);

  const next = useCallback(() => {
    setCurrent((i) => (i === images.length - 1 ? 0 : i + 1));
  }, [images.length]);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === "ArrowRight") prev();
      if (e.key === "ArrowLeft") next();
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [prev, next, onClose]);

  if (!images || images.length === 0) return null;

  const imgUrl = (filename) => getImageUrl("/uploads/devices/" + filename);

  return (
    <div
      className="fixed inset-0 bg-black/90 z-[100] flex flex-col items-center justify-center"
      onClick={onClose}
    >
      {/* دکمه بستن */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 left-4 text-white bg-white/10 hover:bg-white/20 rounded-full w-10 h-10 flex items-center justify-center transition-colors z-10"
      >
        <XMarkIcon className="w-6 h-6" />
      </button>

      {/* شمارنده */}
      <div className="absolute top-4 right-4 text-white/70 text-sm bg-black/40 px-3 py-1 rounded-full z-10">
        {current + 1} / {images.length}
      </div>

      {/* تصویر اصلی */}
      <div
        className="relative flex items-center justify-center w-full max-w-4xl px-16"
        onClick={(e) => e.stopPropagation()}
      >
        {images.length > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className="absolute right-2 text-white bg-white/10 hover:bg-white/25 rounded-full w-12 h-12 flex items-center justify-center text-2xl transition-colors z-10"
            type="button"
          >
            <ChevronRightIcon className="w-6 h-6" />
          </button>
        )}

        <img
          key={current}
          src={imgUrl(images[current].filename)}
          alt={`عکس ${current + 1}`}
          className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-2xl animate-fade"
        />

        {images.length > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className="absolute left-2 text-white bg-white/10 hover:bg-white/25 rounded-full w-12 h-12 flex items-center justify-center text-2xl transition-colors z-10"
            type="button"
          >
            <ChevronLeftIcon className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* بند انگشتی‌ها */}
      {images.length > 1 && (
        <div
          className="flex gap-2 mt-5 overflow-x-auto max-w-2xl px-4 pb-1"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((img, i) => (
            <button
              key={img.id}
              onClick={(e) => {
                e.stopPropagation();
                setCurrent(i);
              }}
              type="button"
              className={`flex-shrink-0 rounded-md overflow-hidden border-2 transition-all ${
                i === current
                  ? "border-white scale-105"
                  : "border-transparent opacity-50 hover:opacity-80"
              }`}
            >
              <img
                src={imgUrl(img.filename)}
                alt={`بند انگشتی ${i + 1}`}
                className="w-16 h-12 object-cover"
              />
            </button>
          ))}
        </div>
      )}

      <p className="mt-3 text-white/40 text-xs">{images[current].filename}</p>
    </div>
  );
}
