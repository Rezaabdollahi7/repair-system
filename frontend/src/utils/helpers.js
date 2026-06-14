// src/utils/helpers.js
import { useState, useEffect } from "react";

export function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export const getBaseUrl = () =>
  import.meta.env.VITE_API_URL || "http://localhost:5001";
export const getImageUrl = (path) => `${getBaseUrl()}${path}`;
