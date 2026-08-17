/**
 * Shapes the API actually returns, written from the controllers rather than
 * guessed. Filled in resource by resource as each page gets converted — an
 * interface written ahead of reading its controller looks like a contract
 * while being documentation, which is worse than having none.
 *
 * Note the API is deliberately inconsistent: most endpoints answer in
 * snake_case, `items` and `categories` in camelCase. See CLAUDE.md. These
 * types mirror that rather than papering over it.
 */

/**
 * Path parameter. Widened to accept strings because React Router hands route
 * params over as such; narrow to `number` once the pages are converted and
 * the parsing happens there.
 */
export type Id = number | string;

/** Query string values, as Axios serializes them. */
export type QueryParams = Record<string, unknown>;

/**
 * The three roles in the seeded `roles` table, per CLAUDE.md and the
 * hierarchy AuthContext already encodes. Not read off the table itself — a
 * fourth role added there would need adding here too.
 */
export type RoleName = "super_admin" | "admin" | "technician";

/** From `toUserResponse` in authController: the role relation flattened. */
export interface AuthUser {
  id: number;
  workspace_id: number;
  full_name: string;
  username: string;
  // Both optional in the schema: `phone` became a secondary contact number
  // once the username took over as the mobile number.
  phone: string | null;
  avatar: string | null;
  role_id: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  role: RoleName;
  role_label: string;
}

/** What login, register and refresh all answer with. */
export interface AuthResponse {
  token: string;
  user: AuthUser;
}

/** logout and change-password answer with a Persian message. */
export interface MessageResponse {
  message: string;
}

/**
 * What both image endpoints have in common. The two shapes differ: uploading
 * returns `device_id` and no `created_at`, listing returns `created_at` and
 * no `device_id` — and both end up in the same array, since a freshly
 * uploaded image is appended to the list the page already holds.
 *
 * `url` is a presigned URL valid for fifteen minutes, signed per request.
 */
export interface DeviceImage {
  id: number;
  filename: string;
  sort_order: number;
  url: string;
}

export interface UploadedDeviceImage extends DeviceImage {
  device_id: number;
}

export interface ListedDeviceImage extends DeviceImage {
  created_at: string;
}

export interface UploadImagesResponse {
  message: string;
  images: UploadedDeviceImage[];
}

/**
 * The paginated envelope the list endpoints return. Note `totalPages` is
 * camelCase while the rows inside are snake_case — that is what the
 * controller sends.
 */
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

/** A row of GET /customers — trimmed, with the device count folded in. */
export interface CustomerListRow {
  id: number;
  name: string;
  phone: string | null;
  device_count: number;
}

export interface CustomerStats {
  total_devices: number;
  successful_repairs: number;
  /**
   * A string, not a number: the controller keeps toFixed(1)'s output as-is.
   * Null when no device has both an entry and an exit date.
   */
  avg_repair_days: string | null;
}

/** GET /customers/:id — the whole row, serialized to snake_case. */
export interface Customer {
  id: number;
  workspace_id: number;
  name: string;
  phone: string | null;
  created_at: string;
}

/** POST and PUT /customers take these; the id and workspace are the server's. */
export interface CustomerBody {
  name: string;
  phone: string;
}

/**
 * A row of GET /customers/:id/devices.
 *
 * `status` is a plain string column, not an enum: the values in use are
 * received, pending, diagnosing, waiting_for_parts, repairing, repaired,
 * ready_for_pickup, delivered, unrepairable and not_repaired. Left as string
 * rather than narrowed, since nothing on the server constrains it.
 */
export interface CustomerDevice {
  id: number;
  customer_id: number | null;
  device_name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  entry_date: string | null;
  exit_date: string | null;
  status: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * What every device endpoint returns — list, read, create and update all go
 * through the same mapper, so the shape never depends on which one produced
 * it.
 *
 * `status` is a plain string column with no server-side constraint. The
 * values the UI knows are received (the default), pending, diagnosing,
 * waiting_for_parts, repairing, repaired, ready_for_pickup, delivered,
 * unrepairable and not_repaired.
 *
 * personnel_id is deliberately absent: technicians come from
 * device_assignments, not that column.
 */
export interface Device {
  id: number;
  customer_id: number | null;
  device_name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  entry_date: string | null;
  exit_date: string | null;
  status: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  needs_invoice: boolean;
  customer_name: string | null;
  customer_phone: string | null;
  /** From the newest sale invoice, or null when there is none. */
  invoice_status: string | null;
  sale_invoice_id: number | null;
  invoice_count: number;
  assignees: DeviceAssignee[];
}

/** A technician assigned to a device, flattened from the join row. */
export interface DeviceAssignee {
  id: number;
  name: string;
  username: string;
}

/**
 * The device list carries `limit` as well, which the customer list does not.
 */
export type PaginatedDevices = PaginatedWithLimit<Device>;

/**
 * POST /devices, written from schemas/device.ts.
 *
 * `customer_id` is typed as it leaves the form, which sends "" for no
 * customer — the schema coerces that to 0 and rejects it as non-positive.
 * Left as-is rather than corrected here: this is a server-side validation
 * question, not a typing one.
 */
export interface DeviceCreateBody {
  customer_id?: number | string | null;
  device_name: string;
  brand?: string | null;
  model?: string | null;
  serial_number?: string | null;
  /** "" is treated as absent before coercion. */
  entry_date?: string | null;
  exit_date?: string | null;
  status?: string;
  description?: string | null;
}

/**
 * PUT /devices/:id — every field optional, absent meaning untouched. The
 * server refuses a body with no keys at all.
 */
export type DeviceUpdateBody = Partial<DeviceCreateBody> & {
  /** Still accepts 1/0 as well as true/false. */
  needs_invoice?: boolean | 0 | 1;
};

/**
 * A row of GET and PUT /devices/:id/assignments.
 *
 * The shape predates the Prisma migration: `id` is the user's id, not the
 * assignment's, which is exposed separately as `assignment_id`.
 */
export interface DeviceAssignment {
  assignment_id: number;
  assigned_at: string;
  id: number;
  name: string;
  username: string;
}

/** Item and device lists carry `limit`; the customer list does not. */
export interface PaginatedWithLimit<T> extends Paginated<T> {
  limit: number;
}

/**
 * Categories answer in camelCase, unlike most of the API. Deliberate —
 * serialize() is not used here because it would break the frontend.
 */
export interface Category {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The frontend only ever sends `name`; the schema accepts both. */
export interface CategoryBody {
  name: string;
  description?: string | null;
}

/**
 * Items answer in camelCase too — except `sell_price`, which the create and
 * update bodies take in snake_case while the response gives `sellPrice`.
 * Left as it is.
 */
export interface Item {
  id: number;
  categoryId: number | null;
  name: string;
  code: string;
  unit: string;
  minStock: number;
  currentStock: number;
  avgPurchasePrice: number;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  sellPrice: number;
  categoryName: string | null;
}

export interface ItemCreateBody {
  code: string;
  name: string;
  unit: string;
  categoryId?: number | string | null;
  minStock?: number;
  description?: string | null;
  /** snake_case where the rest of the body is camelCase. */
  sell_price?: number;
}

export type ItemUpdateBody = Partial<ItemCreateBody>;

/**
 * GET /items/:id/transactions — snake_case, unlike the other item endpoints.
 *
 * `reference_id` is polymorphic and carries no foreign key, so the invoice
 * number is looked up separately and is null for anything else.
 */
export interface InventoryTransaction {
  id: number;
  item_id: number;
  type: string;
  quantity: number;
  unit_price: number;
  reference_id: number | null;
  reference_type: string | null;
  note: string | null;
  created_by: number | null;
  created_at: string;
  purchase_invoice_number: string | null;
}

/** GET /items/search/for-invoice — snake_case, also unlike its neighbours. */
export interface ItemForInvoice {
  id: number;
  code: string;
  name: string;
  unit: string;
  current_stock: number;
  avg_purchase_price: number;
  sell_price: number;
  category_name: string | null;
}

export interface QuickStockResponse {
  message: string;
  invoice_number: string;
  new_stock: number;
}

export interface QuickPurchaseBody {
  quantity: number;
  unit_price: number;
  note?: string;
}

export interface QuickSaleBody {
  quantity: number;
  customer_name?: string;
}

/**
 * GET /personnel — a plain array, not a paginated envelope, so the `limit`
 * parameter callers send has nothing to do.
 *
 * Note the role relation flattens to `role_name` here, while /auth/me gives
 * the same thing as `role`. There is no `name` field on a personnel row.
 */
export interface Personnel {
  id: number;
  workspace_id: number;
  full_name: string;
  username: string;
  phone: string | null;
  avatar: string | null;
  role_id: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  role_name: RoleName;
  role_label: string;
}

/** `username` is a mobile number, shared with sign-up via phoneSchema. */
export interface PersonnelCreateBody {
  full_name: string;
  username: string;
  password: string;
  phone?: string | null;
  role_id: number;
}

/** Every field optional; an absent one keeps its current value. */
export type PersonnelUpdateBody = Partial<PersonnelCreateBody>;

export interface ToggleActiveResponse {
  message: string;
  is_active: boolean;
}

/** Every invoice kind uses these three; the column is a plain string. */
export type PaymentStatus = "paid" | "partial" | "pending";

/** GET /purchase-invoices — the list rows carry no items. */
export interface PurchaseInvoice {
  id: number;
  invoice_number: string;
  supplier_name: string | null;
  invoice_date: string;
  total_amount: number;
  paid_amount: number;
  payment_status: PaymentStatus;
  note: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

/** A line of GET /purchase-invoices/:id, with the item relation flattened. */
export interface PurchaseInvoiceLine {
  id: number;
  invoice_id: number;
  item_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
  item_code: string;
  item_name: string;
  item_unit: string;
}

/** GET /purchase-invoices/:id — the invoice plus its lines. */
export interface PurchaseInvoiceDetail extends PurchaseInvoice {
  items: PurchaseInvoiceLine[];
}

export interface PurchaseInvoiceCreateBody {
  supplier_name: string | null;
  invoice_date: string;
  paid_amount: number;
  note: string | null;
  items: {
    item_id: number;
    quantity: number;
    unit_price: number;
  }[];
}

export interface PaymentUpdateBody {
  paid_amount: number;
}

export interface PaymentUpdateResponse {
  message: string;
  payment_status: PaymentStatus;
}
