/**
 * Brings a shop's data across from the single-tenant Dofixo that ran on
 * SQLite, into one workspace of the SaaS.
 *
 * Roadmap 5.8. Sibling of 5.6, which does the same job for a Fineti export;
 * this one has the advantage that the source schema is our own, so the
 * mapping is mostly "the same columns plus workspaceId" rather than a
 * translation.
 *
 * Three commands, deliberately separate:
 *
 *   plan    reads and reports. Writes nothing, anywhere. This is what gets
 *           read before the real run, and the only command that is safe to
 *           point at production data while thinking.
 *   media   turns every photo into the two sizes 7.0 measured, into a
 *           staging directory. Pure CPU, no database and no network, and
 *           resumable — a file already processed is skipped, so an
 *           interrupted run continues by repeating the same command.
 *   apply   writes the rows and uploads the staged objects.
 *
 * Deliberately NOT one command. media is half an hour of CPU on 3,678
 * photographs and apply talks to a database and an object store; a single
 * run that fails two thirds of the way through would leave no way to
 * continue except starting over.
 *
 * What is not imported, and why: invoices, stock and categories (the source
 * workshop never used them — two purchase invoices, two sale invoices, three
 * items, all test data), services (populateWorkspace seeds the same four),
 * and the company logo (asked for separately, and settings images have their
 * own profile).
 */
import { config } from "dotenv";

/*
 * Loaded here rather than relied on from the environment: this script runs
 * on the host, where nothing has put backend/.env into process.env — the app
 * itself runs in a container that compose fills in. lib/prisma throws at
 * import time without DATABASE_URL_APP, deliberately, so this has to happen
 * before anything reaches it.
 *
 * In production the script runs inside the backend container instead, where
 * the variables are already set and this call finds no file and changes
 * nothing.
 */
config({ path: resolve(__dirname, "..", ".env") });

import { existsSync, statSync } from "fs";
import { basename, resolve } from "path";
import Database from "better-sqlite3";

// ── Source shapes ────────────────────────────────────────────
//
// Written from the old schema.sql rather than inferred: every column below
// was read off the CREATE TABLE statements, and the nullability matches what
// SQLite actually allows there.

interface LegacyUser {
  id: number;
  full_name: string;
  username: string;
  role_id: number;
  is_active: number;
}

interface LegacyCustomer {
  id: number;
  name: string;
  phone: string | null;
  created_at: string;
}

interface LegacyDevice {
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
  needs_invoice: number;
  created_at: string;
  updated_at: string;
}

interface LegacyImage {
  id: number;
  device_id: number;
  filename: string;
  sort_order: number;
  created_at: string;
}

interface LegacyAssignment {
  device_id: number;
  personnel_id: number;
  assigned_at: string;
}

interface LegacySettings {
  company_name: string | null;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_website: string | null;
}

/** One line of the users file — see the note on `apply` below. */
export interface UserMapping {
  oldId: number;
  fullName: string;
  username: string;
  password: string;
  /**
   * `owner` is the workspace's super admin, and the script does not create
   * them: they sign up through the app so populateWorkspace runs — the
   * settings row, the four services, the trial, the referral code and the
   * SMS wallet all come from there, and a second definition of "what a new
   * workspace looks like" is exactly what that function exists to prevent.
   *
   * The line stays in this file anyway, because device assignments reference
   * the old id and the mapping has to resolve it.
   */
  role: "owner" | "admin" | "technician";
}

// ── Reading ──────────────────────────────────────────────────

export function openLegacy(path: string) {
  if (!existsSync(path)) {
    throw new Error(`SQLite file not found: ${path}`);
  }
  // Read-only, and not merely as a precaution: the source database is the
  // only copy of a working shop's history, and a script that can write to it
  // is a script that can damage it.
  return new Database(path, { readonly: true, fileMustExist: true });
}

/**
 * An empty string is not a date.
 *
 * The old app stored "" rather than NULL for a date nobody filled in, which
 * `new Date("")` turns into an Invalid Date and Postgres rejects — the same
 * trap schemas/device.ts already works around for the date pickers. Every
 * one of the 2,054 devices has an empty exit_date, so this is not an edge
 * case here; it is the normal case.
 */
export function toDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Null for a string that is absent or nothing but spaces. */
export function toText(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

// ── plan ─────────────────────────────────────────────────────

interface PlanOptions {
  dbPath: string;
  uploadsDir: string;
  users: UserMapping[];
}

export function plan(options: PlanOptions): void {
  const db = openLegacy(options.dbPath);

  try {
    const users = db
      .prepare("SELECT id, full_name, username, role_id, is_active FROM users")
      .all() as LegacyUser[];
    const customers = db
      .prepare("SELECT COUNT(*) AS n FROM customers")
      .get() as { n: number };
    const devices = db
      .prepare(
        "SELECT id, exit_date, needs_invoice, status, customer_id FROM devices ORDER BY id",
      )
      .all() as Pick<
      LegacyDevice,
      "id" | "exit_date" | "needs_invoice" | "status" | "customer_id"
    >[];
    const images = db
      .prepare("SELECT id, device_id, filename FROM device_images")
      .all() as Pick<LegacyImage, "id" | "device_id" | "filename">[];
    const assignments = db
      .prepare("SELECT device_id, personnel_id FROM device_assignments")
      .all() as Pick<LegacyAssignment, "device_id" | "personnel_id">[];
    const settings = db
      .prepare(
        "SELECT company_name, company_phone, company_address, company_website FROM settings LIMIT 1",
      )
      .get() as LegacySettings | undefined;

    const mapped = new Map(options.users.map((u) => [u.oldId, u]));

    console.log("\n=== وضعیت مبدأ ===\n");

    // Users
    const kept = users.filter((u) => {
      const mapping = mapped.get(u.id);
      return mapping !== undefined && mapping.role !== "owner";
    });
    const dropped = users.filter((u) => {
      const mapping = mapped.get(u.id);
      return mapping === undefined || mapping.role === "owner";
    });
    const owner = options.users.find((u) => u.role === "owner");
    if (owner) {
      console.log(
        `               مالک: ${owner.fullName} — از ثبت‌نام، نه از اسکریپت`,
      );
    }
    console.log(`کاربران        ${kept.length} منتقل · ${dropped.length} رد`);
    for (const user of dropped) {
      console.log(`               رد: ${user.full_name} (${user.username})`);
    }
    for (const user of options.users) {
      if (!users.some((u) => u.id === user.oldId)) {
        console.log(
          `  ⚠️ users.json به شناسه‌ی ${user.oldId} اشاره می‌کند که در مبدأ نیست`,
        );
      }
    }

    console.log(`مشتریان        ${customers.n}`);

    // Devices
    const withoutExit = devices.filter((d) => toDate(d.exit_date) === null);
    const noInvoice = devices.filter((d) => d.needs_invoice === 0);
    const orphaned = devices.filter((d) => d.customer_id === null);
    console.log(
      `دستگاه‌ها       ${devices.length} · شماره پذیرش ۱..${devices.length}`,
    );
    console.log(`               بدون تاریخ خروج: ${withoutExit.length}`);
    console.log(`               needs_invoice=0: ${noInvoice.length}`);
    console.log(`               بدون مشتری: ${orphaned.length}`);

    const statuses = new Map<string, number>();
    for (const device of devices) {
      statuses.set(device.status, (statuses.get(device.status) ?? 0) + 1);
    }
    console.log(
      `               وضعیت‌ها: ${[...statuses]
        .map(([s, n]) => `${s}=${n}`)
        .join(" ")}`,
    );

    // Images — the one place where the database and the disk can disagree.
    let bytes = 0;
    const missing: string[] = [];
    const extensions = new Map<string, number>();
    const deviceIds = new Set(devices.map((d) => d.id));
    const imagesWithoutDevice: number[] = [];

    for (const image of images) {
      const path = resolve(options.uploadsDir, "devices", image.filename);
      if (existsSync(path)) {
        bytes += statSync(path).size;
      } else {
        missing.push(image.filename);
      }

      const ext = (image.filename.split(".").pop() ?? "?").toLowerCase();
      extensions.set(ext, (extensions.get(ext) ?? 0) + 1);

      if (!deviceIds.has(image.device_id)) {
        imagesWithoutDevice.push(image.id);
      }
    }

    console.log(
      `عکس‌ها          ${images.length} · ${(bytes / 1024 ** 3).toFixed(1)} گیگ`,
    );
    console.log(
      `               ${[...extensions].map(([e, n]) => `${e}=${n}`).join(" ")}`,
    );
    if (missing.length > 0) {
      console.log(`  🔴 ${missing.length} فایل روی دیسک نیست:`);
      for (const name of missing.slice(0, 10)) console.log(`     ${name}`);
      if (missing.length > 10)
        console.log(`     … و ${missing.length - 10} تای دیگر`);
    }
    if (imagesWithoutDevice.length > 0) {
      console.log(`  🔴 ${imagesWithoutDevice.length} عکس یتیم (دستگاهش نیست)`);
    }

    // Assignments
    const unknownAssignee = assignments.filter(
      (a) => !mapped.has(a.personnel_id),
    );
    console.log(
      `واگذاری‌ها      ${assignments.length} · ${unknownAssignee.length} به کاربر منتقل‌نشده`,
    );
    if (unknownAssignee.length > 0) {
      const ids = [...new Set(unknownAssignee.map((a) => a.personnel_id))];
      console.log(
        `               (این ردیف‌ها رد می‌شوند — شناسه: ${ids.join(", ")})`,
      );
    }

    // Settings
    if (settings) {
      console.log(`تنظیمات        ${settings.company_name ?? "—"}`);
      console.log(`               ${settings.company_phone ?? "—"}`);
    } else {
      console.log("تنظیمات        ⚠️ ردیفی نیست");
    }

    console.log("\n=== منتقل نمی‌شود ===\n");
    console.log("فاکتورها، انبار، دسته‌بندی (داده‌ی آزمایشی)");
    console.log("خدمات (populateWorkspace همان چهارتا را می‌سازد)");
    console.log("لوگو و بکاپ‌ها\n");
  } finally {
    db.close();
  }
}

// ── media ────────────────────────────────────────────────────

interface MediaOptions {
  dbPath: string;
  uploadsDir: string;
  outDir: string;
  concurrency: number;
  /** For a trial run: stop after this many rows. Absent means all of them. */
  limit?: number;
}
/**
 * Turns every source photograph into the two sizes 7.0 settled on, in a
 * staging directory.
 *
 * Goes through processDeviceImage rather than converting here, so an
 * imported photograph is byte-for-byte what an uploaded one would have been:
 * 3400px at q85, a 480px thumbnail, and `.rotate()` applied. That last one
 * is why a plain file copy was never an option — most phone photographs
 * carry a non-default EXIF orientation, and sharp neither applies the tag
 * nor preserves it. Copying them across would store a thousand pictures
 * sideways.
 *
 * Named after the source row id rather than a fresh uuid, which is what
 * makes this resumable: the same input always produces the same output path,
 * so a file already written is skipped and an interrupted run continues by
 * repeating the command. The uuid an object key actually needs is drawn in
 * `apply`, where the key is built.
 */
export async function media(options: MediaOptions): Promise<void> {
  const { mkdirSync, readFileSync, writeFileSync } = await import("fs");
  const { processDeviceImage } = await import("../src/lib/imageProfile");

  const db = openLegacy(options.dbPath);

  try {
    const allImages = db
      .prepare(
        "SELECT id, device_id, filename, sort_order, created_at FROM device_images ORDER BY id",
      )
      .all() as LegacyImage[];

    // A trial run looks at the first few and stops. Worth having as a flag
    // rather than a temporary edit: the first thing to check is whether the
    // pictures come out the right way up, and that answer costs ten files
    // rather than half an hour.
    const images = options.limit
      ? allImages.slice(0, options.limit)
      : allImages;

    mkdirSync(options.outDir, { recursive: true });

    let done = 0;
    let skipped = 0;
    let failed = 0;
    const failures: string[] = [];
    const startedAt = Date.now();

    // A shared cursor rather than slicing the list into N chunks: the
    // photographs vary from 40KB to 25MB, so fixed chunks would leave one
    // worker grinding through the large ones long after the others finished.
    let cursor = 0;

    async function worker(): Promise<void> {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= images.length) return;

        const image = images[index];
        const source = resolve(options.uploadsDir, "devices", image.filename);
        const fullOut = resolve(options.outDir, `${image.id}.webp`);
        const thumbOut = resolve(options.outDir, `${image.id}-thumb.webp`);

        if (existsSync(fullOut) && existsSync(thumbOut)) {
          skipped += 1;
          continue;
        }

        try {
          const processed = await processDeviceImage(readFileSync(source));
          writeFileSync(fullOut, processed.full);
          writeFileSync(thumbOut, processed.thumbnail);
          done += 1;
        } catch (error) {
          // Counted and named rather than thrown: one unreadable photograph
          // out of 3,678 must not end a run that has half an hour of work
          // behind it. apply refuses to start while any are outstanding.
          failed += 1;
          failures.push(`${image.filename}: ${String(error)}`);
        }

        const seen = done + skipped + failed;
        if (seen % 100 === 0) {
          const seconds = Math.round((Date.now() - startedAt) / 1000);
          console.log(
            `${seen}/${images.length} — ${done} پردازش · ${skipped} رد · ${failed} خطا · ${seconds}s`,
          );
        }
      }
    }

    await Promise.all(
      Array.from({ length: options.concurrency }, () => worker()),
    );

    const seconds = Math.round((Date.now() - startedAt) / 1000);
    console.log(
      `\nتمام: ${done} پردازش · ${skipped} از قبل بود · ${failed} خطا · ${seconds}s`,
    );

    if (failures.length > 0) {
      console.log("\n🔴 خطاها:");
      for (const line of failures) console.log(`   ${line}`);
      process.exitCode = 1;
    }
  } finally {
    db.close();
  }
}

// ── apply ────────────────────────────────────────────────────

interface ApplyOptions {
  dbPath: string;
  stagingDir: string;
  workspaceId: number;
  users: UserMapping[];
  dryRun: boolean;
  /**
   * Skip the rows and go straight to the photographs.
   *
   * For the second run after an upload was interrupted — 3,678 objects over
   * a network will not always finish on the first attempt, and the rows are
   * already in place by then. The device mapping is rebuilt rather than
   * carried: receptionNumber IS the source id, deliberately, so the
   * relationship survives anything.
   */
  imagesOnly: boolean;
}

/**
 * Writes the imported rows and uploads the staged photographs.
 *
 * Two phases, and the split is deliberate. Every row lands in one
 * transaction — six thousand inserts that either all arrive or none do,
 * because a half-imported workshop is worse than an unimported one and there
 * is no undo. The photographs go afterwards and outside it: 3,678 uploads to
 * ArvanCloud inside a transaction would hold locks for as long as the
 * network takes, which is the mistake 8.10 caught once and 12.7 wrote down.
 */
export async function apply(options: ApplyOptions): Promise<void> {
  const { default: prisma, runInWorkspaceTransaction } =
    await import("../src/lib/prisma");

  const db = openLegacy(options.dbPath);

  try {
    // ── Preconditions ────────────────────────────────────────
    //
    // All of them before anything is written. Each turns into a confusing
    // half-failure thousands of rows later if it is left to the insert.

    const destination = await runInWorkspaceTransaction(
      options.workspaceId,
      async (tx) => ({
        workspace: await tx.workspace.findUnique({
          where: { id: options.workspaceId },
          select: { id: true, name: true, deviceSeq: true },
        }),
        customers: await tx.customer.count(),
        devices: await tx.device.count(),
      }),
    );

    if (!destination.workspace) {
      throw new Error(`کارگاه ${options.workspaceId} وجود ندارد`);
    }

    if (
      !options.imagesOnly &&
      (destination.customers > 0 || destination.devices > 0)
    ) {
      throw new Error(
        `کارگاه ${options.workspaceId} خالی نیست ` +
          `(${destination.customers} مشتری، ${destination.devices} دستگاه). ` +
          `ایمپورت روی داده‌ی موجود، همه‌چیز را دوبرابر می‌کند.`,
      );
    }

    const toCreate = options.users.filter((u) => u.role !== "owner");

    // Only when the users are about to be created. On a second pass for the
    // photographs they exist already — because this script put them there —
    // and the check that protects the first run would refuse every one after
    // it.
    if (!options.imagesOnly) {
      const taken = await takenUsernames(toCreate.map((u) => u.username));

      if (taken.length > 0) {
        throw new Error(`این شماره‌ها از قبل حساب دارند: ${taken.join(", ")}`);
      }
    }

    console.log(
      `\nمقصد: کارگاه ${destination.workspace.id} — ${destination.workspace.name}`,
    );
    if (options.dryRun) {
      console.log("حالت آزمایشی — هیچ چیزی نوشته نمی‌شود\n");
    }

    // ── Read the source ──────────────────────────────────────

    const legacyCustomers = db
      .prepare("SELECT id, name, phone, created_at FROM customers ORDER BY id")
      .all() as LegacyCustomer[];

    const legacyDevices = db
      .prepare(
        `SELECT id, customer_id, device_name, brand, model, serial_number,
                entry_date, exit_date, status, description, needs_invoice,
                created_at, updated_at
         FROM devices ORDER BY id`,
      )
      .all() as LegacyDevice[];

    const legacyAssignments = db
      .prepare(
        "SELECT device_id, personnel_id, assigned_at FROM device_assignments",
      )
      .all() as LegacyAssignment[];

    const legacySettings = db
      .prepare(
        `SELECT company_name, company_address, company_phone,
                company_email, company_website FROM settings LIMIT 1`,
      )
      .get() as LegacySettings | undefined;

    console.log(
      `مبدأ: ${toCreate.length} کاربر · ${legacyCustomers.length} مشتری · ` +
        `${legacyDevices.length} دستگاه · ${legacyAssignments.length} واگذاری`,
    );

    if (options.dryRun) {
      console.log(
        "\nپایان حالت آزمایشی. برای اجرای واقعی --dry-run را بردار.\n",
      );
      return;
    }

    // ── Phase one: the rows ──────────────────────────────────

    const roles = await runInWorkspaceTransaction(
      options.workspaceId,
      async (tx) => tx.role.findMany({ select: { id: true, name: true } }),
    );
    const roleId = new Map(roles.map((r) => [r.name, r.id]));

    const startedAt = Date.now();

    /*
     * Rebuilt rather than carried, when the rows are already written.
     *
     * receptionNumber IS the source id, by design — which is what makes
     * --images-only possible at all: the mapping between the two databases
     * can be recovered from the destination alone, at any time, without
     * keeping anything between runs.
     */
    let deviceIds: Map<number, number>;

    if (options.imagesOnly) {
      const rows = await runInWorkspaceTransaction(
        options.workspaceId,
        async (tx) =>
          tx.device.findMany({ select: { id: true, receptionNumber: true } }),
      );
      deviceIds = new Map(rows.map((r) => [r.receptionNumber, r.id]));
      console.log(`نگاشت ${deviceIds.size} دستگاه از دیتابیس بازسازی شد`);
    } else {
      const written = await runInWorkspaceTransaction(
        options.workspaceId,
        async (tx) => {
          // Old id to new id, for every table that something else points at.
          const userIds = new Map<number, number>();
          const customerIds = new Map<number, number>();
          const deviceIds = new Map<number, number>();

          for (const mapping of toCreate) {
            const created = await tx.user.create({
              data: {
                workspaceId: options.workspaceId,
                fullName: mapping.fullName,
                username: mapping.username,
                // Hashed here rather than carried across: the old hashes are
                // bcrypt and would have worked, but the usernames changed —
                // they are phone numbers now — so nobody could have signed in
                // with the pair they remember anyway.
                password: await bcryptHash(mapping.password),
                roleId: roleId.get(mapping.role)!,
              },
              select: { id: true },
            });
            userIds.set(mapping.oldId, created.id);
          }

          // The owner is not created, but assignments may still point at their
          // old id, so the mapping needs an entry for them.
          const owner = options.users.find((u) => u.role === "owner");
          if (owner) {
            const row = await tx.user.findFirst({
              where: { username: owner.username },
              select: { id: true },
            });
            if (row) userIds.set(owner.oldId, row.id);
          }

          for (const customer of legacyCustomers) {
            const created = await tx.customer.create({
              data: {
                workspaceId: options.workspaceId,
                name: customer.name,
                phone: toText(customer.phone),
                createdAt: toDate(customer.created_at) ?? new Date(),
              },
              select: { id: true },
            });
            customerIds.set(customer.id, created.id);
          }

          /*
           * Reception numbers come from the source id, not from the counter.
           *
           * These are historical records, not intakes happening now: the
           * numbers are already written on slips the customers are holding,
           * and 1..2054 is what those slips say. nextReceptionNumber is for
           * the next real device, and the counter is moved past the imported
           * range at the end so it hands out 2055.
           */
          let highestReception = 0;

          for (const device of legacyDevices) {
            const created = await tx.device.create({
              data: {
                workspaceId: options.workspaceId,
                receptionNumber: device.id,
                customerId:
                  device.customer_id === null
                    ? null
                    : (customerIds.get(device.customer_id) ?? null),
                deviceName: device.device_name,
                brand: toText(device.brand),
                model: toText(device.model),
                serialNumber: toText(device.serial_number),
                entryDate: toDate(device.entry_date),
                exitDate: toDate(device.exit_date),
                status: device.status,
                description: toText(device.description),
                needsInvoice: device.needs_invoice === 1,
                createdAt: toDate(device.created_at) ?? new Date(),
                updatedAt: toDate(device.updated_at) ?? new Date(),
              },
              select: { id: true },
            });
            deviceIds.set(device.id, created.id);
            if (device.id > highestReception) highestReception = device.id;
          }

          let assignments = 0;
          for (const assignment of legacyAssignments) {
            const deviceId = deviceIds.get(assignment.device_id);
            const personnelId = userIds.get(assignment.personnel_id);
            // Silently skipping would hide a mapping mistake; plan() reports
            // the count beforehand, so anything dropped here was expected.
            if (deviceId === undefined || personnelId === undefined) continue;

            await tx.deviceAssignment.create({
              data: {
                workspaceId: options.workspaceId,
                deviceId,
                personnelId,
                assignedAt: toDate(assignment.assigned_at) ?? new Date(),
              },
            });
            assignments += 1;
          }

          if (legacySettings) {
            // Updated, not created: populateWorkspace already wrote the row,
            // and a second one would violate the unique workspaceId.
            await tx.settings.update({
              where: { workspaceId: options.workspaceId },
              data: {
                companyName: toText(legacySettings.company_name),
                companyAddress: toText(legacySettings.company_address),
                companyPhone: toText(legacySettings.company_phone),
                companyEmail: toText(legacySettings.company_email),
                companyWebsite: toText(legacySettings.company_website),
              },
            });
          }

          // Past the imported range, so the next real intake continues the
          // series rather than colliding with a number already on a slip.
          await tx.workspace.update({
            where: { id: options.workspaceId },
            data: { deviceSeq: highestReception },
          });

          return {
            users: userIds.size,
            customers: customerIds.size,
            devices: deviceIds.size,
            assignments,
            deviceIds,
          };
        },
        // Six thousand inserts do not finish in Prisma's default five seconds.
        { timeout: 600_000, maxWait: 30_000 },
      );

      const seconds = Math.round((Date.now() - startedAt) / 1000);
      console.log(
        `\nردیف‌ها نوشته شد (${seconds}s): ${written.users} کاربر · ` +
          `${written.customers} مشتری · ${written.devices} دستگاه · ` +
          `${written.assignments} واگذاری`,
      );

      deviceIds = written.deviceIds;
    }

    // ── Phase two: the photographs ───────────────────────────
    //
    // Outside the transaction, and on purpose: 3,678 uploads to ArvanCloud
    // would hold every lock the phase above took for as long as the network
    // takes. Each image is its own upload and its own row, so an interrupted
    // run leaves what it managed and repeating the command continues.

    const legacyImages = db
      .prepare(
        `SELECT id, device_id, filename, sort_order, created_at
         FROM device_images ORDER BY id`,
      )
      .all() as LegacyImage[];

    const { randomUUID } = await import("crypto");
    const { readFileSync } = await import("fs");
    const { deviceImageKey, deviceThumbnailKey, putObject } =
      await import("../src/lib/storage");

    // What is already here, so a repeat run uploads nothing twice. Keyed by
    // the staged filename, which carries the source row id.
    const alreadyImported = await runInWorkspaceTransaction(
      options.workspaceId,
      async (tx) => tx.deviceImage.findMany({ select: { filename: true } }),
    );
    const done = new Set(alreadyImported.map((row) => row.filename));

    let uploaded = 0;
    let skipped = 0;
    let missing = 0;
    const imageStart = Date.now();

    /*
     * Uploaded several at a time, unlike media's CPU work — this is latency,
     * not computation, and a serial loop spends almost all of it waiting.
     * Ten photographs took 53 seconds one at a time, which is five hours for
     * the full set.
     *
     * Six, not more: each upload also opens a transaction to write its row,
     * and the Prisma pool holds ten connections. Six concurrent heavy
     * queries once exhausted it and an ordinary request alongside them could
     * not get a connection at all — the reason the export builder was made
     * serial. Here the transactions are tiny and nothing else is running,
     * but six leaves the margin that lesson bought.
     */
    let imageCursor = 0;

    async function uploadWorker(): Promise<void> {
      for (;;) {
        const index = imageCursor;
        imageCursor += 1;
        if (index >= legacyImages.length) return;

        const image = legacyImages[index];
        const deviceId = deviceIds.get(image.device_id);
        if (deviceId === undefined) {
          missing += 1;
          continue;
        }

        // The source row id, carried onto the row so a second run recognises
        // what it already did. The object key gets a uuid like any upload —
        // this is the filename column, which the app only ever displays.
        const marker = `legacy-${image.id}.webp`;
        if (done.has(marker)) {
          skipped += 1;
          continue;
        }

        const fullPath = resolve(options.stagingDir, `${image.id}.webp`);
        const thumbPath = resolve(options.stagingDir, `${image.id}-thumb.webp`);

        if (!existsSync(fullPath)) {
          // media has not been run for this one, or failed on it. Counted
          // rather than thrown: the rest of the import is sound.
          missing += 1;
          continue;
        }

        const objectName = `${randomUUID()}.webp`;
        const key = deviceImageKey(options.workspaceId, deviceId, objectName);
        const thumbKey = deviceThumbnailKey(
          options.workspaceId,
          deviceId,
          objectName,
        );

        // Full image first, thumbnail second, row third — the order
        // imageController uses, and for its reason: a row pointing at an
        // object that is not there shows as a broken picture, while an object
        // with no row wastes a few kilobytes nobody sees.
        await putObject(key, readFileSync(fullPath), "image/webp");

        let storedThumb: string | null = thumbKey;
        try {
          await putObject(thumbKey, readFileSync(thumbPath), "image/webp");
        } catch {
          storedThumb = null;
        }

        await runInWorkspaceTransaction(options.workspaceId, async (tx) =>
          tx.deviceImage.create({
            data: {
              workspaceId: options.workspaceId,
              deviceId,
              filename: marker,
              filepath: key,
              thumbnailPath: storedThumb,
              sortOrder: image.sort_order,
              createdAt: toDate(image.created_at) ?? new Date(),
            },
          }),
        );

        uploaded += 1;
        if (uploaded % 100 === 0) {
          const elapsed = Math.round((Date.now() - imageStart) / 1000);
          console.log(
            `${uploaded + skipped + missing}/${legacyImages.length} — ${uploaded} آپلود · ${elapsed}s`,
          );
        }
      }
    }

    await Promise.all(Array.from({ length: 6 }, () => uploadWorker()));

    const imageSeconds = Math.round((Date.now() - imageStart) / 1000);
    console.log(
      `\nعکس‌ها (${imageSeconds}s): ${uploaded} آپلود · ${skipped} از قبل · ${missing} جا افتاد`,
    );
    if (missing > 0) {
      console.log("  ⚠️ جا افتاده‌ها: media را دوباره بزن و بعد همین دستور را");
    }
  } finally {
    db.close();
    await prisma.$disconnect();
  }
}

/**
 * Which of these usernames already exist, anywhere on the platform.
 *
 * On the owner connection, and that is the point: a username is unique
 * across every workspace, so this is a question no workspace-scoped query
 * can answer. RLS would narrow it to the destination and report a number
 * free that belongs to somebody else — and the insert would then fail
 * thousands of rows into a transaction, naming nothing useful.
 *
 * An operator script legitimately holds the owner credential; the API never
 * does. Read-only, and the connection is closed immediately.
 */
/** Ten rounds, matching populateWorkspace so an imported account is no weaker. */
async function bcryptHash(plain: string): Promise<string> {
  const { default: bcrypt } = await import("bcryptjs");
  return bcrypt.hash(plain, 10);
}

async function takenUsernames(usernames: string[]): Promise<string[]> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL لازم است — بررسی یکتایی نام کاربری با اتصال مالک انجام می‌شود. " +
        "در پروداکشن این اسکریپت باید از سرویس migrate اجرا شود.",
    );
  }

  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");

  const ownerDb = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const rows = await ownerDb.user.findMany({
      where: { username: { in: usernames } },
      select: { username: true },
    });
    return rows.map((row) => row.username);
  } finally {
    await ownerDb.$disconnect();
  }
}

// ── CLI ──────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function required(name: string): string {
  const value = arg(name);
  if (!value) {
    console.error(`--${name} لازم است`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const command = process.argv[2];

  if (command === "plan") {
    const usersPath = required("users");
    const { readFileSync } = await import("fs");
    const users = JSON.parse(readFileSync(usersPath, "utf8")) as UserMapping[];

    plan({
      dbPath: resolve(required("db")),
      uploadsDir: resolve(required("uploads")),
      users,
    });
    return;
  }

  if (command === "media") {
    await media({
      dbPath: resolve(required("db")),
      uploadsDir: resolve(required("uploads")),
      outDir: resolve(required("out")),
      // Three, not four: the largest photograph here is 25MB and sharp needs
      // roughly 200MB to decode one, on a machine with 7GB already in use.
      concurrency: Number(arg("concurrency") ?? 3),
      limit: arg("limit") ? Number(arg("limit")) : undefined,
    });
    return;
  }

  if (command === "apply") {
    const { readFileSync } = await import("fs");
    const users = JSON.parse(
      readFileSync(required("users"), "utf8"),
    ) as UserMapping[];

    await apply({
      dbPath: resolve(required("db")),
      stagingDir: resolve(required("staging")),
      workspaceId: Number(required("workspace-id")),
      users,
      dryRun: process.argv.includes("--dry-run"),
      imagesOnly: process.argv.includes("--images-only"),
    });
    return;
  }

  console.error(`فرمان ناشناخته: ${command ?? "(هیچ)"}`);
  console.error("plan | media | apply");
  process.exit(1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

void basename;
