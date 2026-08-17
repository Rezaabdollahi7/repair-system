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
export interface PaginatedDevices extends Paginated<Device> {
  limit: number;
}

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
