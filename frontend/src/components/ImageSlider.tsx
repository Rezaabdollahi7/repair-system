import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { transition, duration, ease } from "../motion";
import { toPersianDigits } from "../utils/formatters";
import type { DeviceImage } from "../types/api";

interface ImageSliderProps {
  images: DeviceImage[];
  initialIndex?: number;
  onClose: () => void;
}

/**
 * The photo lightbox.
 *
 * Its whole surface is deliberately theme-independent — see --scrim and
 * --on-dark in index.css. A photo viewer that turns light in the light theme
 * would put the photo against a background brighter than parts of the photo,
 * and every viewer worth using picks dark for that reason.
 */
export default function ImageSlider({
  images,
  initialIndex = 0,
  onClose,
}: ImageSliderProps) {
  const [current, setCurrent] = useState(initialIndex);
  // Which way the last move went, so the outgoing photo leaves on the side
  // the incoming one came from. Without it every change looks like the same
  // cross-fade and the arrows stop feeling like direction.
  const [direction, setDirection] = useState(0);
  const reduceMotion = useReducedMotion();
  const thumbStripRef = useRef<HTMLDivElement>(null);

  const prev = useCallback(() => {
    setDirection(-1);
    setCurrent((i) => (i === 0 ? images.length - 1 : i - 1));
  }, [images.length]);

  const next = useCallback(() => {
    setDirection(1);
    setCurrent((i) => (i === images.length - 1 ? 0 : i + 1));
  }, [images.length]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // RTL: the previous photo is the one to the right, so ArrowRight goes
      // back. This matches the on-screen arrows, which are mirrored too.
      if (e.key === "ArrowRight") prev();
      if (e.key === "ArrowLeft") next();
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [prev, next, onClose]);

  // The strip scrolls horizontally once there are more thumbnails than fit;
  // keeping the active one in view is what makes arrow-key browsing usable.
  useEffect(() => {
    const strip = thumbStripRef.current;
    if (!strip) return;
    const active = strip.children[current] as HTMLElement | undefined;
    active?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [current, reduceMotion]);

  if (!images || images.length === 0) return null;

  // Travel is small: a photo that flies in from the edge of a 4xl container
  // spends most of the animation as a blur. 48px is enough to read as
  // direction.
  const slide = {
    enter: (dir: number) => ({ opacity: 0, x: reduceMotion ? 0 : dir * 48 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: reduceMotion ? 0 : dir * -48 }),
  };

  const chrome =
    "text-on-dark bg-on-dark/10 hover:bg-on-dark/20 backdrop-blur-sm " +
    "rounded-full flex items-center justify-center transition-colors z-10";

  return (
    <motion.div
      className="fixed inset-0 bg-scrim/90 backdrop-blur-sm z-[100] flex flex-col items-center justify-center"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={transition.fast}
      role="dialog"
      aria-modal="true"
      aria-label="نمایش عکس‌ها"
    >
      {/* Close */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className={`absolute top-4 left-4 w-10 h-10 ${chrome}`}
        type="button"
        aria-label="بستن"
      >
        <XMarkIcon className="w-6 h-6" />
      </button>

      {/* Counter */}
      {/* dir="ltr": a slash with a space on either side is a neutral, so in
          an RTL paragraph "۱ / ۳" was being laid out as "۳ / ۱". */}
      <div
        dir="ltr"
        className="absolute top-4 right-4 text-on-dark/70 text-body-sm bg-scrim/40 backdrop-blur-sm px-3 py-1 rounded-pill z-10"
      >
        {toPersianDigits(current + 1)} / {toPersianDigits(images.length)}
      </div>

      {/* Main image */}
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
            className={`absolute right-2 w-12 h-12 ${chrome}`}
            type="button"
            aria-label="عکس قبلی"
          >
            <ChevronRightIcon className="w-6 h-6" />
          </button>
        )}

        {/*
          `mode="wait"` would leave the frame empty between photos. Both are
          absolutely stacked instead, so the outgoing one fades under the
          incoming one and the viewer never sees the backdrop through a hole.
        */}
        <div className="grid w-full place-items-center">
          <AnimatePresence initial={false} custom={direction}>
            <motion.img
              key={current}
              src={images[current].url}
              alt={`عکس ${current + 1}`}
              custom={direction}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: duration.base, ease: ease.out }}
              // Both photos share one grid cell, so the wrapper takes the
              // height of whichever is showing instead of needing a guessed
              // min-height — which is what left the strip overlapping it.
              style={{ gridArea: "1 / 1" }}
              className="max-h-[75vh] max-w-full object-contain rounded-card shadow-xl"
            />
          </AnimatePresence>
        </div>

        {images.length > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className={`absolute left-2 w-12 h-12 ${chrome}`}
            type="button"
            aria-label="عکس بعدی"
          >
            <ChevronLeftIcon className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div
          ref={thumbStripRef}
          className="flex gap-2 mt-5 overflow-x-auto max-w-2xl px-4 pb-1"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((img, i) => (
            <button
              key={img.id}
              onClick={(e) => {
                e.stopPropagation();
                setDirection(i > current ? 1 : -1);
                setCurrent(i);
              }}
              type="button"
              aria-label={`عکس ${i + 1}`}
              aria-current={i === current}
              className={`shrink-0 rounded-field overflow-hidden border-2 transition-all duration-200 ${
                i === current
                  ? "border-on-dark scale-105"
                  : "border-transparent opacity-50 hover:opacity-90"
              }`}
            >
              <img
                src={img.thumbnail_url ?? img.url}
                alt=""
                className="w-16 h-12 object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      <p className="mt-3 text-on-dark/50 text-body-xs">
        {images[current].filename}
      </p>
    </motion.div>
  );
}
