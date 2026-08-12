// src/api/index.js
import axios from "axios";

const baseURL =
  (import.meta.env.VITE_API_URL || "http://localhost:5001") + "/api";

// withCredentials so the refresh cookie travels: the API is a different
// origin from the dev server, and cross-origin requests drop cookies unless
// asked to carry them.
const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

/**
 * A second client for /auth/refresh, deliberately without the response
 * interceptor below — otherwise a failing refresh would trigger a refresh,
 * and so on.
 */
const authClient = axios.create({ baseURL, withCredentials: true });

/**
 * The access token lives here rather than in localStorage.
 *
 * It is gone on reload, which is the point: script that gets onto the page
 * cannot read a variable it has no reference to, while localStorage is
 * readable by anything running on the origin. The session survives reloads
 * through the refresh cookie instead, which the page cannot read at all.
 */
let accessToken = null;

export function setAccessToken(token) {
  accessToken = token;
}

/**
 * Called when the session is beyond saving, so AuthContext can clear its
 * state and route to the login page. A callback rather than
 * window.location.href, which throws away the whole React tree and any
 * unsaved work along with it.
 */
let onSessionExpired = null;

export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

/** Endpoints where a 401 is the answer, not a signal to renew anything. */
const AUTH_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/logout",
];

function isAuthPath(url = "") {
  return AUTH_PATHS.some((path) => url.startsWith(path));
}

/**
 * In flight while a refresh is happening, so ten requests that all expire at
 * once wait on one renewal rather than starting ten.
 *
 * That matters more than it looks: each refresh rotates the token, so the
 * second would present one the first had just revoked — which the server
 * reads as a stolen copy and answers by ending every session the user has.
 */
let refreshInFlight = null;

function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = authClient
      .post("/auth/refresh")
      .then((res) => {
        setAccessToken(res.data.token);
        return res.data;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    // _retried guards against a loop: if the renewed token is refused too,
    // the second 401 falls straight through.
    if (
      error.response?.status !== 401 ||
      !original ||
      original._retried ||
      isAuthPath(original.url)
    ) {
      return Promise.reject(error);
    }

    original._retried = true;

    try {
      await refreshSession();
      return api(original);
    } catch {
      // The refresh cookie is gone, expired, or was revoked. Nothing left to
      // try — the caller has to sign in again.
      setAccessToken(null);
      onSessionExpired?.();
      return Promise.reject(error);
    }
  },
);

export { refreshSession };

// Devices
export const getDevices = (params) => api.get("/devices", { params });
export const getDevice = (id) => api.get(`/devices/${id}`);
export const createDevice = (data) => api.post("/devices", data);
export const updateDevice = (id, data) => api.put(`/devices/${id}`, data);
export const deleteDevice = (id) => api.delete(`/devices/${id}`);

// Customers
export const getCustomers = (params) => api.get("/customers", { params });
export const getCustomer = (id) => api.get(`/customers/${id}`);
export const createCustomer = (data) => api.post("/customers", data);
export const updateCustomer = (id, data) => api.put(`/customers/${id}`, data);
export const getCustomerDevices = (id) => api.get(`/customers/${id}/devices`);
export const getCustomerStats = (id) => api.get(`/customers/${id}/stats`);
export const deleteCustomer = (id) => api.delete(`/customers/${id}`);
export const searchCustomers = (q) =>
  api.get("/customers", { params: { search: q, limit: 20 } });

export const getDeviceImages = (deviceId) =>
  api.get(`/devices/${deviceId}/images`);

export const uploadDeviceImages = (deviceId, files) => {
  const formData = new FormData();
  files.forEach((file) => formData.append("images", file));
  return api.post(`/devices/${deviceId}/images`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const deleteDeviceImage = (deviceId, imageId) =>
  api.delete(`/devices/${deviceId}/images/${imageId}`);

// Auth
export const login = (credentials) => api.post("/auth/login", credentials);
export const register = (data) => api.post("/auth/register", data);
export const logout = () => authClient.post("/auth/logout");
export const getMe = () => api.get("/auth/me");
export const changeMyPassword = (data) =>
  api.put("/auth/change-password", data);

// Personnel
export const getPersonnel = (params) => api.get("/personnel", { params });
export const getPersonnelOne = (id) => api.get(`/personnel/${id}`);
export const createPersonnel = (data) => api.post("/personnel", data);
export const updatePersonnel = (id, data) => api.put(`/personnel/${id}`, data);
export const togglePersonnelActive = (id) =>
  api.put(`/personnel/${id}/toggle-active`);
export const deletePersonnel = (id) => api.delete(`/personnel/${id}`);
export const changePersonnelPassword = (id, data) =>
  api.put(`/personnel/${id}/change-password`, data);

// Device Assignments
export const getDeviceAssignments = (deviceId) =>
  api.get(`/devices/${deviceId}/assignments`);

export const addDeviceAssignment = (deviceId, personnelId) =>
  api.post(`/devices/${deviceId}/assignments`, { personnel_id: personnelId });

export const removeDeviceAssignment = (deviceId, personnelId) =>
  api.delete(`/devices/${deviceId}/assignments/${personnelId}`);

export const setDeviceAssignments = (deviceId, personnelIds) =>
  api.put(`/devices/${deviceId}/assignments`, { personnel_ids: personnelIds });

// Categories
export const getCategories = () => api.get("/categories");
export const createCategory = (data) => api.post("/categories", data);
export const updateCategory = (id, data) => api.put(`/categories/${id}`, data);
export const deleteCategory = (id) => api.delete(`/categories/${id}`);

// Items
export const getItems = (params) => api.get("/items", { params });
export const getItem = (id) => api.get(`/items/${id}`);
export const createItem = (data) => api.post("/items", data);
export const updateItem = (id, data) => api.put(`/items/${id}`, data);
export const deleteItem = (id) => api.delete(`/items/${id}`);
export const searchItems = (params) => api.get("/items/search", { params });
export const getLowStockItems = () => api.get("/items/low-stock");
export const getItemTransactions = (id, params) =>
  api.get(`/items/${id}/transactions`, { params });

// Purchase Invoices
export const getPurchaseInvoices = (params) =>
  api.get("/purchase-invoices", { params });
export const getPurchaseInvoice = (id) => api.get(`/purchase-invoices/${id}`);
export const createPurchaseInvoice = (data) =>
  api.post("/purchase-invoices", data);
export const updatePurchaseInvoicePayment = (id, data) =>
  api.put(`/purchase-invoices/${id}/payment`, data);
export const deletePurchaseInvoice = (id) =>
  api.delete(`/purchase-invoices/${id}`);

// Sale Invoices
export const getSaleInvoices = (params) =>
  api.get("/sale-invoices", { params });
export const getSaleInvoice = (id) => api.get(`/sale-invoices/${id}`);
export const createSaleInvoice = (data) => api.post("/sale-invoices", data);
export const updateSaleInvoice = (id, data) =>
  api.put(`/sale-invoices/${id}`, data);
export const updateSaleInvoicePayment = (id, data) =>
  api.put(`/sale-invoices/${id}/payment`, data);
export const deleteSaleInvoice = (id) => api.delete(`/sale-invoices/${id}`);

export const quickSale = (id, data) =>
  api.post(`/items/${id}/quick-sale`, data);

// Reports
export const getDashboardStats = () => api.get("/reports/dashboard");
export const getStockReport = (params) => api.get("/reports/stock", { params });
export const getPurchaseReport = (params) =>
  api.get("/reports/purchases", { params });
export const getSaleReport = (params) => api.get("/reports/sales", { params });
export const getProfitReport = (params) =>
  api.get("/reports/profit", { params });

// Settings
export const getSettings = () => api.get("/settings");
export const updateSettings = (data) => api.put("/settings", data);
export const uploadSettingImage = (type, file) => {
  const formData = new FormData();
  formData.append("image", file);
  return api.post(`/settings/upload/${type}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

// Repair Invoices
export const getRepairInvoices = (params) =>
  api.get("/repair-invoices", { params });
export const getRepairInvoice = (id) => api.get(`/repair-invoices/${id}`);
export const createRepairInvoice = (data) => api.post("/repair-invoices", data);
export const updateRepairInvoice = (id, data) =>
  api.put(`/repair-invoices/${id}`, data);
export const deleteRepairInvoice = (id) => api.delete(`/repair-invoices/${id}`);
export const changeRepairInvoiceStatus = (id, status) =>
  api.put(`/repair-invoices/${id}/status`, { status });
export const addRepairInvoicePayment = (id, data) =>
  api.post(`/repair-invoices/${id}/payments`, data);

// Devices - search for invoice
export const searchDevicesForInvoice = (q) =>
  api.get("/devices", { params: { search: q, limit: 20 } });

// Items - search for invoice (از قبل داریم)
export const searchItemsForInvoice = (q) =>
  api.get("/items/search/for-invoice", { params: { q } });

// Services (از قبل داریم)
export const getServices = () => api.get("/services");

// Users - technicians only
export const getTechnicians = () =>
  api.get("/personnel", { params: { role: "technician" } });

export default api;
