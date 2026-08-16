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
