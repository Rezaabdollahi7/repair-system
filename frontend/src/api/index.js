// src/api/index.js
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5001/api",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

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
export const updateSaleInvoicePayment = (id, data) =>
  api.put(`/sale-invoices/${id}/payment`, data);
export const deleteSaleInvoice = (id) => api.delete(`/sale-invoices/${id}`);

export const quickSale = (id, data) =>
  api.post(`/items/${id}/quick-sale`, data);

export default api;
