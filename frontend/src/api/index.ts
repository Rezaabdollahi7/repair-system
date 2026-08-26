import axios from "axios";
import type {
  AuthResponse,
  AuthUser,
  Id,
  MessageResponse,
  QueryParams,
  Customer,
  CustomerBody,
  CustomerDevice,
  CustomerListRow,
  CustomerStats,
  Paginated,
  PaginatedDevices,
  Device,
  DeviceAssignee,
  DeviceCreateBody,
  DeviceImage,
  ListedDeviceImage,
  UploadedDeviceImage,
  DeviceUpdateBody,
  DeviceAssignment,
  Category,
  CategoryBody,
  ItemCreateBody,
  Item,
  ItemForInvoice,
  ItemUpdateBody,
  InventoryTransaction,
  PaginatedWithLimit,
  QuickPurchaseBody,
  QuickSaleBody,
  QuickStockResponse,
  Personnel,
  PersonnelCreateBody,
  PersonnelUpdateBody,
  ToggleActiveResponse,
  PurchaseInvoice,
  PurchaseInvoiceCreateBody,
  PurchaseInvoiceDetail,
  PurchaseInvoiceLine,
  PaymentUpdateBody,
  PaymentUpdateResponse,
  SaleInvoice,
  SaleInvoiceCreateBody,
  SaleInvoiceCreated,
  SaleInvoiceDetail,
  SaleInvoiceLine,
  SaleInvoiceLineBody,
  AppSettings,
  RepairInvoice,
  RepairInvoiceCreateBody,
  RepairInvoiceCreated,
  RepairInvoiceDetail,
  RepairInvoiceLine,
  RepairInvoiceLineBody,
  RepairInvoicePayment,
  RepairInvoiceStatus,
  RepairPaymentBody,
  RepairPaymentResponse,
  AppService,
  DashboardStats,
  StockReport,
  PurchaseReport,
  SaleReport,
  ProfitReport,
  DataExport,
  ExportCreateBody,
  SendOtpBody,
  RegisterBody,
  ResetPasswordBody,
} from "../types/api";

/**
 * Axios has no slot of its own for a retry marker, and casting at each of the
 * three places it is touched would hide what the field means. Declared once,
 * beside the interceptor that owns it.
 */
declare module "axios" {
  export interface InternalAxiosRequestConfig {
    _retried?: boolean;
  }
}

// In production the app and the API are served from one origin behind the
// reverse proxy, so a relative path is both correct and independent of which
// domain the bundle ends up on — the built image is not tied to app.dofixo.ir.
// VITE_API_URL is baked in at build time, so anything absolute here would be.
const baseURL = import.meta.env.PROD
  ? "/api"
  : (import.meta.env.VITE_API_URL || "http://localhost:5001") + "/api";
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
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

/**
 * Called when the session is beyond saving, so AuthContext can clear its
 * state and route to the login page. A callback rather than
 * window.location.href, which throws away the whole React tree and any
 * unsaved work along with it.
 */
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null) {
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
  // Neither answers 401 today, so this changes nothing yet. Listed because
  // the rule is "endpoints reached without a session", and a later 401 from
  // one of them would otherwise trigger a refresh with no cookie to refresh.
  "/auth/send-otp",
  "/auth/reset-password",
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
let refreshInFlight: Promise<AuthResponse> | null = null;

function refreshSession(): Promise<AuthResponse> {
  if (!refreshInFlight) {
    refreshInFlight = authClient
      .post<AuthResponse>("/auth/refresh")
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
  async (error: unknown) => {
    // Anything that is not an Axios error has no response to inspect, and
    // fell through the status check below before this guard existed.
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error);
    }

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
export const getDevices = (params?: QueryParams) =>
  api.get<PaginatedDevices>("/devices", { params });
export const getDevice = (id: Id) => api.get<Device>(`/devices/${id}`);
export const createDevice = (data: DeviceCreateBody) =>
  api.post<Device>("/devices", data);
export const updateDevice = (id: Id, data: DeviceUpdateBody) =>
  api.put<Device>(`/devices/${id}`, data);
export const deleteDevice = (id: Id) =>
  api.delete<MessageResponse>(`/devices/${id}`);

// Customers
export const getCustomers = (params?: QueryParams) =>
  api.get<Paginated<CustomerListRow>>("/customers", { params });
export const getCustomer = (id: Id) => api.get<Customer>(`/customers/${id}`);
export const createCustomer = (data: CustomerBody) =>
  api.post<Customer>("/customers", data);
export const updateCustomer = (id: Id, data: CustomerBody) =>
  api.put<Customer>(`/customers/${id}`, data);
export const getCustomerDevices = (id: Id) =>
  api.get<CustomerDevice[]>(`/customers/${id}/devices`);
export const getCustomerStats = (id: Id) =>
  api.get<CustomerStats>(`/customers/${id}/stats`);
export const deleteCustomer = (id: Id) =>
  api.delete<{ success: boolean }>(`/customers/${id}`);
export const searchCustomers = (q: string) =>
  api.get<Paginated<CustomerListRow>>("/customers", {
    params: { search: q, limit: 20 },
  });

export const getDeviceImages = (deviceId: Id) =>
  api.get<ListedDeviceImage[]>(`/devices/${deviceId}/images`);

export const uploadDeviceImages = (deviceId: Id, files: File[]) => {
  const formData = new FormData();
  files.forEach((file) => formData.append("images", file));
  return api.post(`/devices/${deviceId}/images`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const deleteDeviceImage = (deviceId: Id, imageId: Id) =>
  api.delete(`/devices/${deviceId}/images/${imageId}`);

// Auth
export const login = (credentials: { username: string; password: string }) =>
  api.post<AuthResponse>("/auth/login", credentials);
export const register = (data: RegisterBody) =>
  api.post<AuthResponse>("/auth/register", data);

// Both are reached with no session at all, so they go through `api` rather
// than authClient — there is no token to attach and no 401 to renew.
export const sendOtp = (data: SendOtpBody) =>
  api.post<MessageResponse>("/auth/send-otp", data);
export const resetPassword = (data: ResetPasswordBody) =>
  api.post<MessageResponse>("/auth/reset-password", data);
export const logout = () => authClient.post<MessageResponse>("/auth/logout");
export const getMe = () => api.get<AuthUser>("/auth/me");
export const changeMyPassword = (data: {
  current_password: string;
  new_password: string;
}) => api.put<MessageResponse>("/auth/change-password", data);

// Personnel
export const getPersonnel = (params?: QueryParams) =>
  api.get<Personnel[]>("/personnel", { params });
export const getPersonnelOne = (id: Id) =>
  api.get<Personnel>(`/personnel/${id}`);
export const createPersonnel = (data: PersonnelCreateBody) =>
  api.post<Personnel>("/personnel", data);
export const updatePersonnel = (id: Id, data: PersonnelUpdateBody) =>
  api.put<Personnel>(`/personnel/${id}`, data);
export const togglePersonnelActive = (id: Id) =>
  api.put<ToggleActiveResponse>(`/personnel/${id}/toggle-active`);
export const deletePersonnel = (id: Id) =>
  api.delete<MessageResponse>(`/personnel/${id}`);

// Device Assignments
export const getDeviceAssignments = (deviceId: Id) =>
  api.get<DeviceAssignment[]>(`/devices/${deviceId}/assignments`);

export const addDeviceAssignment = (deviceId: Id, personnelId: number) =>
  api.post<MessageResponse>(`/devices/${deviceId}/assignments`, {
    personnel_id: personnelId,
  });

export const removeDeviceAssignment = (deviceId: Id, personnelId: number) =>
  api.delete<MessageResponse>(
    `/devices/${deviceId}/assignments/${personnelId}`,
  );

export const setDeviceAssignments = (deviceId: Id, personnelIds: number[]) =>
  api.put<DeviceAssignment[]>(`/devices/${deviceId}/assignments`, {
    personnel_ids: personnelIds,
  });

// Categories
export const getCategories = () => api.get<Category[]>("/categories");
export const createCategory = (data: CategoryBody) =>
  api.post<Category>("/categories", data);
export const updateCategory = (id: Id, data: CategoryBody) =>
  api.put<Category>(`/categories/${id}`, data);
export const deleteCategory = (id: Id) =>
  api.delete<MessageResponse>(`/categories/${id}`);
// Items
export const getItems = (params?: QueryParams) =>
  api.get<PaginatedWithLimit<Item>>("/items", { params });
export const getItem = (id: Id) => api.get<Item>(`/items/${id}`);
export const createItem = (data: ItemCreateBody) =>
  api.post<Item>("/items", data);
export const updateItem = (id: Id, data: ItemUpdateBody) =>
  api.put<Item>(`/items/${id}`, data);
export const deleteItem = (id: Id) =>
  api.delete<MessageResponse>(`/items/${id}`);
export const searchItems = (params?: QueryParams) =>
  api.get<PaginatedWithLimit<Item>>("/items/search", { params });
export const getLowStockItems = () => api.get<Item[]>("/items/low-stock");
export const getItemTransactions = (id: Id, params?: QueryParams) =>
  api.get<PaginatedWithLimit<InventoryTransaction>>(
    `/items/${id}/transactions`,
    { params },
  );

// Was reached through a bare api.post from two components; named here so the
// URL lives in one place like every other endpoint.
export const quickPurchase = (id: Id, data: QuickPurchaseBody) =>
  api.post<QuickStockResponse>(`/items/${id}/quick-purchase`, data);

// Purchase Invoices
export const getPurchaseInvoices = (params?: QueryParams) =>
  api.get<PaginatedWithLimit<PurchaseInvoice>>("/purchase-invoices", {
    params,
  });
export const getPurchaseInvoice = (id: Id) =>
  api.get<PurchaseInvoiceDetail>(`/purchase-invoices/${id}`);
export const createPurchaseInvoice = (data: PurchaseInvoiceCreateBody) =>
  api.post<PurchaseInvoice>("/purchase-invoices", data);
export const updatePurchaseInvoicePayment = (id: Id, data: PaymentUpdateBody) =>
  api.put<PaymentUpdateResponse>(`/purchase-invoices/${id}/payment`, data);
export const deletePurchaseInvoice = (id: Id) =>
  api.delete<MessageResponse>(`/purchase-invoices/${id}`);

// Sale Invoices
export const getSaleInvoices = (params?: QueryParams) =>
  api.get<PaginatedWithLimit<SaleInvoice>>("/sale-invoices", { params });
export const getSaleInvoice = (id: Id) =>
  api.get<SaleInvoiceDetail>(`/sale-invoices/${id}`);
export const createSaleInvoice = (data: SaleInvoiceCreateBody) =>
  api.post<SaleInvoiceCreated>("/sale-invoices", data);
export const updateSaleInvoice = (id: Id, data: SaleInvoiceCreateBody) =>
  api.put<MessageResponse>(`/sale-invoices/${id}`, data);
export const updateSaleInvoicePayment = (id: Id, data: PaymentUpdateBody) =>
  api.put<PaymentUpdateResponse>(`/sale-invoices/${id}/payment`, data);
export const deleteSaleInvoice = (id: Id) =>
  api.delete<MessageResponse>(`/sale-invoices/${id}`);

export const quickSale = (id: Id, data: QuickSaleBody) =>
  api.post<QuickStockResponse>(`/items/${id}/quick-sale`, data);

// Reports
export const getDashboardStats = () =>
  api.get<DashboardStats>("/reports/dashboard");
export const getStockReport = (params?: QueryParams) =>
  api.get<StockReport>("/reports/stock", { params });
export const getPurchaseReport = (params?: QueryParams) =>
  api.get<PurchaseReport>("/reports/purchases", { params });
export const getSaleReport = (params?: QueryParams) =>
  api.get<SaleReport>("/reports/sales", { params });
export const getProfitReport = (params?: QueryParams) =>
  api.get<ProfitReport>("/reports/profit", { params });

// Settings
export const getSettings = () => api.get<AppSettings>("/settings");
export const updateSettings = (data: Partial<AppSettings>) =>
  api.put<AppSettings>("/settings", data);
export const uploadSettingImage = (type: string, file: File) => {
  const formData = new FormData();
  formData.append("image", file);
  return api.post<{ message: string; path: string }>(
    `/settings/upload/${type}`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
};

// Repair Invoices
export const getRepairInvoices = (params?: QueryParams) =>
  api.get<PaginatedWithLimit<RepairInvoice>>("/repair-invoices", { params });
export const getRepairInvoice = (id: Id) =>
  api.get<RepairInvoiceDetail>(`/repair-invoices/${id}`);
export const createRepairInvoice = (data: RepairInvoiceCreateBody) =>
  api.post<RepairInvoiceCreated>("/repair-invoices", data);
export const updateRepairInvoice = (id: Id, data: RepairInvoiceCreateBody) =>
  api.put<MessageResponse>(`/repair-invoices/${id}`, data);
export const deleteRepairInvoice = (id: Id) =>
  api.delete<MessageResponse>(`/repair-invoices/${id}`);
export const changeRepairInvoiceStatus = (
  id: Id,
  status: RepairInvoiceStatus,
) => api.put<MessageResponse>(`/repair-invoices/${id}/status`, { status });
export const addRepairInvoicePayment = (id: Id, data: RepairPaymentBody) =>
  api.post<RepairPaymentResponse>(`/repair-invoices/${id}/payments`, data);

export const getServices = () => api.get<AppService[]>("/services");

// Devices - search for invoice
export const searchDevicesForInvoice = (q: string) =>
  api.get<PaginatedDevices>("/devices", { params: { search: q, limit: 20 } });

// Items - search for invoice (از قبل داریم)
export const searchItemsForInvoice = (q: string) =>
  api.get<ItemForInvoice[]>("/items/search/for-invoice", { params: { q } });

// Users - technicians only
export const getTechnicians = () =>
  api.get<Personnel[]>("/personnel", { params: { role: "technician" } });

// Data exports
export const getExports = () => api.get<DataExport[]>("/exports");
export const createExport = (data: ExportCreateBody) =>
  api.post<DataExport>("/exports", data);
export const getExportDownload = (id: Id) =>
  api.get<{ url: string }>(`/exports/${id}/download`);
export const deleteExport = (id: Id) =>
  api.delete<MessageResponse>(`/exports/${id}`);

export default api;
