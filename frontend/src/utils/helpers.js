// src/utils/helpers.js
export const getBaseUrl = () =>
  import.meta.env.VITE_API_URL || "http://localhost:5001";
export const getImageUrl = (path) => `${getBaseUrl()}${path}`;
