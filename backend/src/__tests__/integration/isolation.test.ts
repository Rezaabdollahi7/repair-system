import request from "supertest";
import app from "../../app";
import prisma from "../../lib/prisma";
import {
  disconnectOwner,
  owner,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

// Not mocked, unlike the unit tests: these requests go through the real
// client, the real policies and a real database. That is the only place
// tenant isolation actually happens.

/**
 * One entry per REST resource. Adding a resource means adding a line here
 * rather than writing four more tests, so a new endpoint cannot quietly ship
 * without an isolation check.
 */
interface Resource {
  name: string;
  path: string;
  /** Creates one row in the given workspace, on the owner connection. */
  create: (workspaceId: number) => Promise<number>;
  /** Whether the row is still there — checked on the owner connection. */
  exists: (id: number) => Promise<boolean>;
  /** Defaults to `${path}/${id}`; only set where the API differs. */
  updatePath?: (id: number) => string;
  /**
   * Must satisfy the resource's Zod schema, or the request never reaches the
   * handler and the test proves nothing.
   */
  updateBody?: Record<string, unknown>;
  skipGetOne?: boolean;
  skipUpdate?: boolean;
  skipDelete?: boolean;
}

// Username is unique across the whole platform, not per workspace, so the
// fixtures cannot reuse one between the two sides of a test.
let usernameSeq = 0;

const resources: Resource[] = [
  {
    name: "customers",
    path: "/api/customers",
    create: async (workspaceId) => {
      const row = await owner.customer.create({
        data: { workspaceId, name: `مشتری ${workspaceId}` },
        select: { id: true },
      });
      return row.id;
    },
    exists: async (id) => (await owner.customer.count({ where: { id } })) === 1,
    updateBody: { name: "نام تازه" },
  },
  {
    name: "devices",
    path: "/api/devices",
    create: async (workspaceId) => {
      const row = await owner.device.create({
        data: { workspaceId, deviceName: `یخچال ${workspaceId}` },
        select: { id: true },
      });
      return row.id;
    },
    exists: async (id) => (await owner.device.count({ where: { id } })) === 1,
    updateBody: { device_name: "یخچال ویرایش‌شده" },
  },
  {
    name: "items",
    path: "/api/items",
    create: async (workspaceId) => {
      const row = await owner.item.create({
        // The same code in both workspaces on purpose: Item.code is unique
        // per workspace, not globally, and a clash here would mean that
        // constraint had been widened by mistake.
        data: { workspaceId, name: `خازن ${workspaceId}`, code: "C-100" },
        select: { id: true },
      });
      return row.id;
    },
    exists: async (id) => (await owner.item.count({ where: { id } })) === 1,
    updateBody: { minStock: 8 },
  },
  {
    name: "categories",
    path: "/api/categories",
    create: async (workspaceId) => {
      const row = await owner.category.create({
        // The same name in both workspaces on purpose: Category.name is
        // unique per workspace, and a clash here would mean that constraint
        // had been widened by mistake.
        data: { workspaceId, name: "قطعات" },
        select: { id: true },
      });
      return row.id;
    },
    exists: async (id) => (await owner.category.count({ where: { id } })) === 1,
    updateBody: { name: "قطعات ویرایش‌شده" },
  },
  {
    name: "services",
    path: "/api/services",
    create: async (workspaceId) => {
      const row = await owner.service.create({
        data: { workspaceId, name: "دستمزد تعمیر" },
        select: { id: true },
      });
      return row.id;
    },
    exists: async (id) => (await owner.service.count({ where: { id } })) === 1,
    // The only resource with no GET /:id — it is a short reference list the
    // frontend loads whole.
    skipGetOne: true,
    updateBody: { name: "دستمزد ویرایش‌شده" },
  },
  {
    name: "personnel",
    path: "/api/personnel",
    create: async (workspaceId) => {
      const technician = await owner.role.findUniqueOrThrow({
        where: { name: "technician" },
        select: { id: true },
      });

      const row = await owner.user.create({
        data: {
          workspaceId,
          fullName: "تکنسین",
          username: `0913${String(++usernameSeq).padStart(7, "0")}`,
          // Not a real hash: nothing logs in as this account.
          password: "unused",
          roleId: technician.id,
        },
        select: { id: true },
      });
      return row.id;
    },
    exists: async (id) => (await owner.user.count({ where: { id } })) === 1,
    updateBody: { full_name: "نام تازه" },
  },
  {
    name: "purchase-invoices",
    path: "/api/purchase-invoices",
    create: async (workspaceId) => {
      const row = await owner.purchaseInvoice.create({
        data: { workspaceId, invoiceNumber: "PUR-20260810-001" },
        select: { id: true },
      });
      return row.id;
    },
    exists: async (id) =>
      (await owner.purchaseInvoice.count({ where: { id } })) === 1,
    // No PUT /:id at all — the only editable part is the payment.
    updatePath: (id) => `/api/purchase-invoices/${id}/payment`,
    updateBody: { paid_amount: 0 },
  },
  {
    name: "sale-invoices",
    path: "/api/sale-invoices",
    create: async (workspaceId) => {
      const row = await owner.saleInvoice.create({
        data: { workspaceId, invoiceNumber: "SAL-20260810-001" },
        select: { id: true },
      });
      return row.id;
    },
    exists: async (id) =>
      (await owner.saleInvoice.count({ where: { id } })) === 1,
    updatePath: (id) => `/api/sale-invoices/${id}/payment`,
    updateBody: { paid_amount: 0 },
  },
  {
    name: "repair-invoices",
    path: "/api/repair-invoices",
    create: async (workspaceId) => {
      // deviceId is NOT NULL on this model: a repair invoice without its
      // device would be meaningless, so the fixture makes one first.
      const device = await owner.device.create({
        data: { workspaceId, deviceName: "یخچال" },
        select: { id: true },
      });

      const row = await owner.repairInvoice.create({
        data: {
          workspaceId,
          invoiceNumber: "INV-20260810-0001",
          deviceId: device.id,
        },
        select: { id: true },
      });
      return row.id;
    },
    exists: async (id) =>
      (await owner.repairInvoice.count({ where: { id } })) === 1,
    updatePath: (id) => `/api/repair-invoices/${id}/status`,
    updateBody: { status: "issued" },
  },
  {
    name: "exports",
    path: "/api/exports",
    create: async (workspaceId) => {
      const row = await owner.backup.create({
        // ready, not pending: a pending row is treated as a build in
        // progress and refuses to be deleted, which would fail the delete
        // check for the wrong reason.
        data: {
          workspaceId,
          filename: `export-${workspaceId}.zip`,
          status: "ready",
          filepath: `workspaces/${workspaceId}/exports/test.zip`,
        },
        select: { id: true },
      });
      return row.id;
    },
    exists: async (id) => (await owner.backup.count({ where: { id } })) === 1,
    // The single-row endpoint is /:id/download, which answers with a signed
    // URL rather than the row, and there is no update: an export is built
    // once and then only fetched or removed.
    skipGetOne: true,
    skipUpdate: true,
  },
];

let workspaces: TwoWorkspaces;

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
});

afterAll(async () => {
  await disconnectOwner();
  await prisma.$disconnect();
});

/** List endpoints answer either with a bare array or with { data: [...] }. */
function rowsOf(body: unknown): { id: number }[] {
  if (Array.isArray(body)) {
    return body as { id: number }[];
  }

  if (body && typeof body === "object") {
    const data = (body as { data?: unknown }).data;
    if (Array.isArray(data)) {
      return data as { id: number }[];
    }
  }

  throw new Error(`Unrecognised list response: ${JSON.stringify(body)}`);
}

/**
 * A 400 means validation rejected the request before the handler ever ran,
 * so a passing 404 assertion would be measuring nothing. Fails loudly with
 * the reason rather than letting the suite look green.
 */
function assertReachedHandler(
  res: { status: number; body: unknown },
  resource: string,
) {
  if (res.status === 400) {
    throw new Error(
      `${resource}: validation rejected the request (400: ` +
        `${JSON.stringify(res.body)}), so it never reached the handler. ` +
        `Fix updateBody for this resource.`,
    );
  }
}

describe.each(resources)("$name", (resource) => {
  const { name, path } = resource;
  const updatePath = resource.updatePath ?? ((id: number) => `${path}/${id}`);

  it("lists only the caller's own rows", async () => {
    const ownId = await resource.create(workspaces.a.workspaceId);
    const foreignId = await resource.create(workspaces.b.workspaceId);

    const res = await request(app)
      .get(path)
      .set("Authorization", `Bearer ${workspaces.a.token}`);

    expect(res.status).toBe(200);

    // By id rather than by count: personnel also lists the workspace's own
    // super admin, and a bare length check would say nothing about which
    // rows came back anyway.
    const ids = rowsOf(res.body).map((row) => row.id);
    expect(ids).toContain(ownId);
    expect(ids).not.toContain(foreignId);
  });

  (resource.skipGetOne ? it.skip : it)(
    "returns 404 when reading another workspace's row",
    async () => {
      const foreignId = await resource.create(workspaces.b.workspaceId);

      const res = await request(app)
        .get(`${path}/${foreignId}`)
        .set("Authorization", `Bearer ${workspaces.a.token}`);

      // 404 rather than 403: whether the row exists at all is itself something
      // the other workspace has no business learning.
      expect(res.status).toBe(404);
    },
  );

  (resource.skipUpdate ? it.skip : it)(
    "returns 404 when updating another workspace's row",
    async () => {
      const foreignId = await resource.create(workspaces.b.workspaceId);

      const res = await request(app)
        .put(updatePath(foreignId))
        .set("Authorization", `Bearer ${workspaces.a.token}`)
        .send(resource.updateBody ?? {});

      assertReachedHandler(res, name);
      expect(res.status).toBe(404);
    },
  );

  (resource.skipDelete ? it.skip : it)(
    "returns 404 when deleting another workspace's row, and leaves it alone",
    async () => {
      const foreignId = await resource.create(workspaces.b.workspaceId);

      const res = await request(app)
        .delete(`${path}/${foreignId}`)
        .set("Authorization", `Bearer ${workspaces.a.token}`);

      // Checked on the owner connection, which bypasses RLS. A deleteMany
      // scoped to the wrong workspace answers "0 rows affected" and the
      // handler turns that into the same 404 — identical from the outside,
      // so the status code alone cannot tell a refused delete from a
      // successful one.
      expect(await resource.exists(foreignId)).toBe(true);
      expect(res.status).toBe(404);
    },
  );
});
