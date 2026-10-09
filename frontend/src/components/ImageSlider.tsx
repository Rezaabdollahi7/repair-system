import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  MinusIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { transition, duration, ease } from "../motion";
import { toPersianDigits } from "../utils/formatters";
import type { DeviceImage } from "../types/api";
interface ImageSliderProps {
  images: DeviceImage[];
  initialIndex?: number;
  onClose: () => void;
}
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;
export default function ImageSlider({
  images,
  initialIndex = 0,
  onClose,
}: ImageSliderProps) {
  const [current, setCurrent] = useState(initialIndex);
  const [direction, setDirection] = useState(0);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const reduceMotion = useReducedMotion();
  const thumbStripRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  /* * ------------------------------------------------------------ * Navigation * ------------------------------------------------------------ */ const prev =
    useCallback(() => {
      setDirection(-1);
      setCurrent((i) => (i === 0 ? images.length - 1 : i - 1));
    }, [images.length]);
  const next = useCallback(() => {
    setDirection(1);
    setCurrent((i) => (i === images.length - 1 ? 0 : i + 1));
  }, [images.length]);
  /* * ------------------------------------------------------------ * Zoom * ------------------------------------------------------------ */ const zoomIn =
    useCallback(() => {
      setZoom((value) =>
        Math.min(MAX_ZOOM, Number((value + ZOOM_STEP).toFixed(2))),
      );
    }, []);
  const zoomOut = useCallback(() => {
    setZoom((value) =>
      Math.max(MIN_ZOOM, Number((value - ZOOM_STEP).toFixed(2))),
    );
  }, []);
  const resetZoom = useCallback(() => {
    setZoom(MIN_ZOOM);
  }, []);
  /* * ------------------------------------------------------------ * Mouse Wheel Zoom * ------------------------------------------------------------ */ const handleWheel =
    useCallback(
      (e: React.WheelEvent<HTMLDivElement>) => {
        /* * Prevent the page from scrolling while the cursor * is over the image. */ e.preventDefault();
        if (e.deltaY < 0) {
          zoomIn();
        } else {
          zoomOut();
        }
      },
      [zoomIn, zoomOut],
    );
  /* * ------------------------------------------------------------ * Keyboard shortcuts * ------------------------------------------------------------ */ useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      /* * Don't trigger image navigation when the user * is interacting with a form element. */ const target =
        e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
      ) {
        return;
      }
      if (e.key === "ArrowRight") {
        prev();
      }
      if (e.key === "ArrowLeft") {
        next();
      }
      if (e.key === "Escape") {
        onClose();
      }
      /* * Optional keyboard zoom shortcuts. */ if (
        e.key === "+" ||
        e.key === "="
      ) {
        zoomIn();
      }
      if (e.key === "-") {
        zoomOut();
      }
      if (e.key === "0") {
        resetZoom();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [prev, next, onClose, zoomIn, zoomOut, resetZoom]);
  /* * ------------------------------------------------------------ * Reset zoom whenever the image changes * ------------------------------------------------------------ */ useEffect(() => {
    setZoom(MIN_ZOOM);
  }, [current]);
  /* * ------------------------------------------------------------ * Keep active thumbnail visible * ------------------------------------------------------------ */ useEffect(() => {
    const strip = thumbStripRef.current;
    if (!strip) return;
    const active = strip.children[current] as HTMLElement | undefined;
    active?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [current, reduceMotion]);
  /* * ------------------------------------------------------------ * Animation * ------------------------------------------------------------ */ if (
    !images ||
    images.length === 0
  ) {
    return null;
  }
  const slide = {
    enter: (dir: number) => ({ opacity: 0, x: reduceMotion ? 0 : dir * 48 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: reduceMotion ? 0 : dir * -48 }),
  };
  /* * ------------------------------------------------------------ * Shared button style * ------------------------------------------------------------ */ const chrome =
    "text-on-dark bg-on-dark/10 hover:bg-on-dark/20 " +
    "backdrop-blur-sm rounded-full flex items-center " +
    "justify-center transition-colors z-20";
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
      {" "}
      {/* ====================================================== Close button ====================================================== */}{" "}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className={`absolute top-4 left-4 w-10 h-10 ${chrome}`}
        type="button"
        aria-label="بستن"
      >
        {" "}
        <XMarkIcon className="w-6 h-6" />{" "}
      </button>{" "}
      {/* ====================================================== Counter ====================================================== */}{" "}
      <div
        dir="ltr"
        className="absolute top-4 right-4 text-on-dark/70 text-body-sm bg-scrim/40 backdrop-blur-sm px-3 py-1 rounded-pill z-20"
      >
        {" "}
        {toPersianDigits(current + 1)} / {toPersianDigits(images.length)}{" "}
      </div>{" "}
      {/* ====================================================== Main image area ====================================================== */}{" "}
      <div
        ref={imageContainerRef}
        className="relative flex items-center justify-center w-full max-w-5xl px-16"
        onClick={(e) => e.stopPropagation()}
      >
        {" "}
        {/* ==================================================== Previous button ==================================================== */}{" "}
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
            {" "}
            <ChevronRightIcon className="w-6 h-6" />{" "}
          </button>
        )}{" "}
        {/* ==================================================== Image wrapper Wheel zoom is attached here instead of directly to img so that the container remains interactive. ==================================================== */}{" "}
        <div
          className="relative grid w-full place-items-center overflow-hidden rounded-card"
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
          style={{ touchAction: zoom > MIN_ZOOM ? "none" : "pan-y" }}
        >
          {" "}
          <AnimatePresence initial={false} custom={direction}>
            {" "}
            <motion.div
              key={current}
              custom={direction}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: duration.base, ease: ease.out }}
              className="grid w-full place-items-center"
              style={{ gridArea: "1 / 1" }}
            >
              {" "}
              <motion.img
                src={images[current].url}
                alt={`عکس ${current + 1}`}
                draggable={false}
                className={` max-h-[75vh] max-w-full object-contain rounded-card shadow-xl select-none ${zoom > MIN_ZOOM ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"} `}
                style={{ scale: zoom }}
                drag={zoom > MIN_ZOOM}
                dragConstraints={{
                  left: -250 * (zoom - 1),
                  right: 250 * (zoom - 1),
                  top: -200 * (zoom - 1),
                  bottom: 200 * (zoom - 1),
                }}
                dragElastic={0.05}
                dragMomentum={false}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (zoom > MIN_ZOOM) {
                    resetZoom();
                  } else {
                    setZoom(2);
                  }
                }}
              />{" "}
            </motion.div>{" "}
          </AnimatePresence>{" "}
        </div>{" "}
        {/* ==================================================== Next button ==================================================== */}{" "}
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
            {" "}
            <ChevronLeftIcon className="w-6 h-6" />{" "}
          </button>
        )}{" "}
        {/* ==================================================== Zoom controls On mobile these buttons provide the primary way to zoom. ==================================================== */}{" "}
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1 rounded-full bg-scrim/60 backdrop-blur-md z-20"
          onClick={(e) => e.stopPropagation()}
        >
          {" "}
          {/* Zoom Out */}{" "}
          <button
            type="button"
            onClick={zoomOut}
            disabled={zoom <= MIN_ZOOM}
            className={` w-10 h-10 ${chrome} disabled:opacity-30 disabled:cursor-not-allowed `}
            aria-label="کوچک کردن عکس"
            title="Zoom Out"
          >
            {" "}
            <MinusIcon className="w-5 h-5" />{" "}
          </button>{" "}
          {/* Zoom percentage */}{" "}
          <button
            type="button"
            onClick={resetZoom}
            className="min-w-16 h-10 px-2 rounded-full text-on-dark text-body-xs hover:bg-on-dark/10 transition-colors"
            aria-label="بازنشانی زوم"
            title="Reset Zoom"
          >
            {" "}
            {toPersianDigits(Math.round(zoom * 100))}٪{" "}
          </button>{" "}
          {/* Zoom In */}{" "}
          <button
            type="button"
            onClick={zoomIn}
            disabled={zoom >= MAX_ZOOM}
            className={` w-10 h-10 ${chrome} disabled:opacity-30 disabled:cursor-not-allowed `}
            aria-label="بزرگ کردن عکس"
            title="Zoom In"
          >
            {" "}
            <PlusIcon className="w-5 h-5" />{" "}
          </button>{" "}
          {/* Reset */}{" "}
          {zoom > MIN_ZOOM && (
            <button
              type="button"
              onClick={resetZoom}
              className={`w-10 h-10 ${chrome}`}
              aria-label="بازنشانی اندازه عکس"
              title="Reset"
            >
              {" "}
              <ArrowPathIcon className="w-5 h-5" />{" "}
            </button>
          )}{" "}
        </div>{" "}
      </div>{" "}
      {/* ====================================================== Thumbnails ====================================================== */}{" "}
      {images.length > 1 && (
        <div
          ref={thumbStripRef}
          className="flex gap-2 mt-5 overflow-x-auto max-w-2xl px-4 pb-1"
          onClick={(e) => e.stopPropagation()}
        >
          {" "}
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
              className={` shrink-0 rounded-field overflow-hidden border-2 transition-all duration-200 ${i === current ? "border-on-dark scale-105" : "border-transparent opacity-50 hover:opacity-90"} `}
            >
              {" "}
              <img
                src={img.thumbnail_url ?? img.url}
                alt=""
                className="w-16 h-12 object-cover"
                loading="lazy"
              />{" "}
            </button>
          ))}{" "}
        </div>
      )}{" "}
    </motion.div>
  );
}
