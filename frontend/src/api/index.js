// src/api/index.js
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5001/api",
  headers: {
    "Content-Type": "application/json",
  },
});

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

export default api;
