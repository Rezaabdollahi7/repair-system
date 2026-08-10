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

let workspaces: TwoWorkspaces;

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
});

afterAll(async () => {
  await disconnectOwner();
  await prisma.$disconnect();
});

describe("settings", () => {
  // A singleton per workspace with no /:id, so the table-driven checks have
  // nothing to point at. The risk is the opposite one: a lookup that finds
  // the single settings row rather than this workspace's.
  beforeEach(async () => {
    await owner.settings.createMany({
      data: [
        { workspaceId: workspaces.a.workspaceId, companyName: "تعمیرگاه الف" },
        { workspaceId: workspaces.b.workspaceId, companyName: "تعمیرگاه ب" },
      ],
    });
  });

  it("returns the caller's own settings", async () => {
    const res = await request(app)
      .get("/api/settings")
      .set("Authorization", `Bearer ${workspaces.a.token}`);

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain("تعمیرگاه الف");
    expect(JSON.stringify(res.body)).not.toContain("تعمیرگاه ب");
  });

  it("writes to the caller's own settings and leaves the other alone", async () => {
    const res = await request(app)
      .put("/api/settings")
      .set("Authorization", `Bearer ${workspaces.a.token}`)
      .send({ company_name: "نام تازه" });

    expect(res.status).toBeLessThan(400);

    const other = await owner.settings.findUniqueOrThrow({
      where: { workspaceId: workspaces.b.workspaceId },
      select: { companyName: true },
    });
    expect(other.companyName).toBe("تعمیرگاه ب");
  });
});

describe("dashboard", () => {
  /** Every number anywhere in the response, however it is nested. */
  function numbersIn(value: unknown): number[] {
    if (typeof value === "number") {
      return [value];
    }
    if (Array.isArray(value)) {
      return value.flatMap(numbersIn);
    }
    if (value && typeof value === "object") {
      return Object.values(value).flatMap(numbersIn);
    }
    return [];
  }

  it("counts nothing when the workspace is empty, however full the other is", async () => {
    // Seventeen separate queries feed this endpoint, and nine of them were
    // once unscoped — one workshop's dashboard showed everyone's figures.
    // Asserting on every number rather than named fields means a query added
    // later is covered without anyone remembering to extend this test.
    const other = workspaces.b.workspaceId;

    const customer = await owner.customer.create({
      data: { workspaceId: other, name: "مشتری ب" },
      select: { id: true },
    });
    await owner.device.create({
      data: {
        workspaceId: other,
        deviceName: "یخچال",
        customerId: customer.id,
      },
    });
    await owner.item.create({
      data: { workspaceId: other, name: "خازن", currentStock: 5, minStock: 10 },
    });
    await owner.saleInvoice.create({
      data: {
        workspaceId: other,
        invoiceNumber: "SAL-20260810-001",
        totalAmount: 500000,
        paidAmount: 500000,
      },
    });
    await owner.purchaseInvoice.create({
      data: {
        workspaceId: other,
        invoiceNumber: "PUR-20260810-001",
        totalAmount: 300000,
      },
    });

    const res = await request(app)
      .get("/api/reports/dashboard")
      .set("Authorization", `Bearer ${workspaces.a.token}`);

    expect(res.status).toBe(200);

    const leaked = numbersIn(res.body).filter((value) => value !== 0);
    expect(leaked).toEqual([]);

    // The control: the same endpoint must report those same rows to the
    // workspace that owns them. Without this, an endpoint broken into
    // always answering zero would satisfy the assertion above.
    const owning = await request(app)
      .get("/api/reports/dashboard")
      .set("Authorization", `Bearer ${workspaces.b.token}`);

    expect(owning.status).toBe(200);
    expect(numbersIn(owning.body).some((value) => value !== 0)).toBe(true);
  });
});

describe("personnel", () => {
  async function foreignTechnician() {
    const role = await owner.role.findUniqueOrThrow({
      where: { name: "technician" },
      select: { id: true },
    });

    return owner.user.create({
      data: {
        workspaceId: workspaces.b.workspaceId,
        fullName: "تکنسین ب",
        username: "09139999999",
        password: "unused",
        roleId: role.id,
        isActive: true,
      },
      select: { id: true },
    });
  }

  // users is the one table a SECURITY DEFINER path also reaches, and phase 3
  // will open a second aperture for sign-up. If either is ever widened past
  // what it needs, this is where it shows.
  it("cannot deactivate an account in another workspace", async () => {
    const technician = await foreignTechnician();

    const res = await request(app)
      .put(`/api/personnel/${technician.id}/toggle-active`)
      .set("Authorization", `Bearer ${workspaces.a.token}`)
      .send({});

    const after = await owner.user.findUniqueOrThrow({
      where: { id: technician.id },
      select: { isActive: true },
    });

    expect(after.isActive).toBe(true);
    expect(res.status).toBe(404);
  });

  it("cannot read another workspace's account through /auth/me", async () => {
    // The token names a real user, so this proves the lookup is scoped
    // rather than trusting the id in the payload.
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${workspaces.a.token}`);

    expect(res.status).toBe(200);
    expect(res.body.workspace_id).toBe(workspaces.a.workspaceId);
    expect(res.body.id).toBe(workspaces.a.userId);
  });
});
