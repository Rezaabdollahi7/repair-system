import { useEffect, useRef, useState } from "react";

/**
 * The rendered width of an element, in CSS pixels, kept current on resize.
 *
 * The charts need this because they draw in real pixels rather than in a
 * scaled viewBox. A viewBox is one line of code and scales the whole drawing
 * uniformly — including the text, which is the problem: the same chart card
 * is about 700px on a desktop and 340px on a phone, so an 11px axis label
 * would arrive at 5px there. Measuring instead lets the geometry reflow while
 * the type stays the size it was set at.
 *
 * Starts at 0, which every caller reads as "not measured yet" and skips
 * drawing for — one frame of an empty box rather than a chart laid out for a
 * width the element does not have.
 */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Set once up front: ResizeObserver does fire an initial entry, but only
    // on the next frame, and without this the first paint has no chart.
    setWidth(element.clientWidth);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}
