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
import { runWithWorkspace } from "../../lib/workspaceContext";
import { buildWorkbook } from "../../utils/export/workbook";
import ExcelJS from "exceljs";

// The export build runs after its response has been sent and reaches for
// object storage; the integration setup only points S3 at an invalid host, so
// without this the upload fails after Jest has torn the environment down.
//
// Mocked here rather than in the setup file: this is the only suite that
// starts a build, and a global mock would silently apply to suites whose
// files say nothing about it.
jest.mock("../../lib/storage", () => ({
  exportKey: (workspaceId: number, filename: string) =>
    `workspaces/${workspaceId}/exports/${filename}`,
  putObject: jest.fn().mockResolvedValue(undefined),
  getObject: jest.fn().mockResolvedValue(Buffer.from("")),
  signedUrlFor: jest.fn().mockResolvedValue("https://example.test/signed"),
  deleteObject: jest.fn().mockResolvedValue(undefined),
  deleteObjects: jest.fn().mockResolvedValue(undefined),
}));
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

describe("data exports", () => {
  // The table-driven checks cover the list and the delete. Three things they
  // cannot: the download endpoint's shape, the guard against a second build,
  // and — the one that matters — whether the workbook itself is scoped.
  beforeEach(async () => {
    await owner.customer.createMany({
      data: [
        { workspaceId: workspaces.a.workspaceId, name: "مشتری الف" },
        { workspaceId: workspaces.b.workspaceId, name: "مشتری ب" },
      ],
    });
  });

  it("refuses to sign a download for another workspace's export", async () => {
    const other = await owner.backup.create({
      data: {
        workspaceId: workspaces.b.workspaceId,
        filename: "export-b.zip",
        status: "ready",
        filepath: `workspaces/${workspaces.b.workspaceId}/exports/b.zip`,
      },
      select: { id: true },
    });

    const res = await request(app)
      .get(`/api/exports/${other.id}/download`)
      .set("Authorization", `Bearer ${workspaces.a.token}`);

    expect(res.status).toBe(404);
    expect(res.body.url).toBeUndefined();
  });

  it("will not start a second build while one is pending", async () => {
    await owner.backup.create({
      data: {
        workspaceId: workspaces.a.workspaceId,
        filename: "in-progress.zip",
        status: "pending",
      },
    });

    const res = await request(app)
      .post("/api/exports")
      .set("Authorization", `Bearer ${workspaces.a.token}`)
      .send({ include_images: false });

    expect(res.status).toBe(409);
  });

  it("ignores a pending row left behind by a dead build", async () => {
    // Older than the staleness window, so nothing is going to finish it.
    await owner.backup.create({
      data: {
        workspaceId: workspaces.a.workspaceId,
        filename: "abandoned.zip",
        status: "pending",
        createdAt: new Date(Date.now() - 31 * 60 * 1000),
      },
    });

    const res = await request(app)
      .post("/api/exports")
      .set("Authorization", `Bearer ${workspaces.a.token}`)
      .send({ include_images: false });

    expect(res.status).toBe(202);
    // The build starts on setImmediate; let it finish before the test ends,
    // or it runs on into a torn-down environment.
    // The build starts on setImmediate; let it finish before the test ends,
    // or it runs on into a torn-down environment.
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  it("builds a workbook holding only the caller's rows", async () => {
    // Called directly rather than through the endpoint: the build runs after
    // the response, so a request-level test would assert against a file that
    // does not exist yet. The workspace context is opened the same way the
    // background job opens it.
    const workbook = await runWithWorkspace(workspaces.a.workspaceId, () =>
      buildWorkbook(),
    );

    // Read back through ExcelJS rather than searched as bytes: xlsx is a zip,
    // so the text is compressed and a substring check finds nothing.
    const book = new ExcelJS.Workbook();
    // Cast because exceljs's bundled types predate Buffer becoming generic in
    // @types/node; the two are the same object at runtime.
    await book.xlsx.load(
      workbook as unknown as Parameters<typeof book.xlsx.load>[0],
    );

    const sheet = book.getWorksheet("مشتریان");
    expect(sheet).toBeDefined();

    // Column 1 is the name; `values` is 1-based with the header at index 1.
    // `values` is 1-based and sparse — index 0 is unused and index 1 is the
    // header — so the rows start at 2.
    const names = (sheet!.getColumn(1).values as unknown[])
      .slice(2)
      .map((value) => String(value));

    expect(names).toContain("مشتری الف");
    expect(names).not.toContain("مشتری ب");
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

  // The personnel page's aggregate reads assignments and devices as well as
  // the user row, so it has three chances to lose its scope rather than one.
  it("will not assemble another workspace's personnel page", async () => {
    const technician = await foreignTechnician();

    const res = await request(app)
      .get(`/api/personnel/${technician.id}/overview`)
      .set("Authorization", `Bearer ${workspaces.a.token}`);

    // 404 rather than an empty page: an empty overview asserts that the
    // account exists and has done nothing, which is itself a disclosure.
    expect(res.status).toBe(404);
  });

  it("counts only the caller's own assignments", async () => {
    const foreign = await foreignTechnician();

    const device = await owner.device.create({
      data: {
        workspaceId: workspaces.b.workspaceId,
        deviceName: "یخچال ب",
        status: "delivered",
      },
      select: { id: true },
    });

    await owner.deviceAssignment.create({
      data: {
        workspaceId: workspaces.b.workspaceId,
        deviceId: device.id,
        personnelId: foreign.id,
      },
    });

    // The caller's own super admin, who has been assigned nothing.
    const res = await request(app)
      .get(`/api/personnel/${workspaces.a.userId}/overview`)
      .set("Authorization", `Bearer ${workspaces.a.token}`);

    expect(res.status).toBe(200);
    expect(res.body.kpi.completed_repairs).toBe(0);
    expect(res.body.history).toEqual([]);
    expect(res.body.status_breakdown).toEqual([]);
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

// The customer page reads one aggregate endpoint that pulls devices, repair
// invoices and sale invoices in one go, and writes a note through a nested
// route. Neither fits the table in isolation.test.ts: the read is an
// aggregate across four tables rather than a row, and the write is not the
// resource's own PUT.
describe("customer overview and notes", () => {
  async function foreignCustomerWithHistory() {
    const customer = await owner.customer.create({
      data: {
        workspaceId: workspaces.b.workspaceId,
        name: "مشتری ب",
        phone: "09131111111",
        notes: "یادداشت خصوصی کارگاه ب",
      },
      select: { id: true },
    });

    const device = await owner.device.create({
      data: {
        workspaceId: workspaces.b.workspaceId,
        customerId: customer.id,
        deviceName: "یخچال ب",
        status: "repairing",
      },
      select: { id: true },
    });

    await owner.repairInvoice.create({
      data: {
        workspaceId: workspaces.b.workspaceId,
        invoiceNumber: "REP-B001",
        deviceId: device.id,
        customerId: customer.id,
        totalAmount: 5_000_000,
        paidAmount: 5_000_000,
        paymentStatus: "paid",
      },
    });

    return customer.id;
  }

  it("will not assemble another workspace's customer page", async () => {
    const customerId = await foreignCustomerWithHistory();

    const res = await request(app)
      .get(`/api/customers/${customerId}/overview`)
      .set("Authorization", `Bearer ${workspaces.a.token}`);

    // 404 rather than an empty page: an empty overview would say the
    // customer exists and has no history, which is itself a leak.
    expect(res.status).toBe(404);
  });

  it("assembles only the caller's own rows", async () => {
    // Two customers with the same shape, one per workspace. If any of the
    // four reads inside the handler lost its scope, the counts would pick
    // up the other side.
    await foreignCustomerWithHistory();

    const mine = await owner.customer.create({
      data: { workspaceId: workspaces.a.workspaceId, name: "مشتری الف" },
      select: { id: true },
    });

    const res = await request(app)
      .get(`/api/customers/${mine.id}/overview`)
      .set("Authorization", `Bearer ${workspaces.a.token}`);

    expect(res.status).toBe(200);
    expect(res.body.customer.name).toBe("مشتری الف");
    expect(res.body.summary.total_devices).toBe(0);
    expect(res.body.summary.total_paid).toBe(0);
    expect(res.body.devices).toEqual([]);
    expect(res.body.invoices).toEqual([]);
    expect(res.body.timeline).toEqual([]);
  });

  it("cannot write a note onto another workspace's customer", async () => {
    const customerId = await foreignCustomerWithHistory();

    const res = await request(app)
      .put(`/api/customers/${customerId}/notes`)
      .set("Authorization", `Bearer ${workspaces.a.token}`)
      .send({ notes: "نوشته‌ی مهاجم" });

    const after = await owner.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { notes: true },
    });

    // updateMany with a workspace in its where clause writes nothing and
    // reports it. A plain `update` on the id would have overwritten this.
    expect(res.status).toBe(404);
    expect(after.notes).toBe("یادداشت خصوصی کارگاه ب");
  });
});

// otp_codes is here rather than in isolation.test.ts because it is not a
// tenant-scoped resource and the table-driven suite there has nothing to say
// about it: there is no workspace to be denied from.
//
// What is worth proving is the opposite of everything else in these files —
// that the sharing is real and deliberate. A future migration that "fixes"
// this table by adding a workspace_id and a real policy would break sign-up
// for every new customer, because a code is sent before a workspace exists.
describe("otp_codes is deliberately shared", () => {
  it("is readable with no workspace context at all", async () => {
    // Every other table answers this with zero rows. This one has to answer
    // with the row, or send-otp cannot look up what it just wrote.
    await owner.otpCode.create({
      data: {
        phone: "09120000009",
        purpose: "register",
        codeHash: "a".repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const found = await prisma.otpCode.findMany({
      where: { phone: "09120000009" },
    });

    expect(found).toHaveLength(1);
  });

  it("carries RLS with a permissive policy, not no RLS", async () => {
    // The distinction the whole design rests on: both behave identically, but
    // only one records in the catalogue that the sharing was chosen.
    const [table] = await owner.$queryRaw<
      { relrowsecurity: boolean; policies: bigint }[]
    >`
      SELECT
        c.relrowsecurity,
        (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'otp_codes'
    `;

    expect(table.relrowsecurity).toBe(true);
    expect(Number(table.policies)).toBe(1);
  });

  it("has no workspace_id column to scope by", async () => {
    // Stated as a test so that adding one is a decision somebody makes, not
    // a side effect of a schema tidy-up.
    const columns = await owner.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'otp_codes'
        AND column_name = 'workspace_id'
    `;

    expect(columns).toHaveLength(0);
  });
});

// ── SMS wallet (12.1) ────────────────────────────────────────
//
// None of these four tables has a REST route yet, so there is nothing for
// the table in isolation.test.ts to point at. They still carry money and a
// customer's phone number from the moment the migration runs, which is the
// wrong thing to leave untested until 12.8 — a policy missing here would be
// discovered by whoever writes the controller, or by nobody.
//
// Asserted through the application client, which is the only one the
// policies apply to: `owner` bypasses them by design and is used for setup.
describe("sms wallet tables", () => {
  beforeEach(async () => {
    await owner.smsWallet.createMany({
      data: [
        { workspaceId: workspaces.a.workspaceId, balanceRials: 100_000 },
        { workspaceId: workspaces.b.workspaceId, balanceRials: 900_000 },
      ],
    });
  });

  it("shows a workspace only its own wallet", async () => {
    const seen = await runWithWorkspace(workspaces.a.workspaceId, () =>
      prisma.smsWallet.findMany(),
    );

    expect(seen).toHaveLength(1);
    expect(seen[0].workspaceId).toBe(workspaces.a.workspaceId);
    expect(seen[0].balanceRials.toNumber()).toBe(100_000);
  });

  it("will not let one workspace debit another's wallet", async () => {
    // The shape 12.3's debit takes, run against the wrong workspace. The
    // policy makes it match no row rather than refusing loudly, which is the
    // same answer as "not enough credit" — so this test is what separates a
    // working isolation boundary from a wallet that silently never works.
    const updated = await runWithWorkspace(workspaces.a.workspaceId, () =>
      prisma.smsWallet.updateMany({
        where: { workspaceId: workspaces.b.workspaceId },
        data: { balanceRials: { decrement: 3_500 } },
      }),
    );

    expect(updated.count).toBe(0);

    const untouched = await owner.smsWallet.findUniqueOrThrow({
      where: { workspaceId: workspaces.b.workspaceId },
    });
    expect(untouched.balanceRials.toNumber()).toBe(900_000);
  });

  it("refuses to write a ledger row into another workspace", async () => {
    // WITH CHECK, not USING: filtering a foreign row out of a read is not
    // the same as refusing to create one, and only the second keeps a
    // mis-scoped write from landing.
    await expect(
      runWithWorkspace(workspaces.a.workspaceId, () =>
        prisma.smsWalletTransaction.create({
          data: {
            workspaceId: workspaces.b.workspaceId,
            type: "adjustment",
            amountRials: 1_000,
            balanceBeforeRials: 0,
            balanceAfterRials: 1_000,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("keeps send logs and top-ups apart", async () => {
    await owner.smsMessage.createMany({
      data: [
        {
          workspaceId: workspaces.a.workspaceId,
          phone: "09120000011",
          kind: "device_accepted",
          unitPriceRials: 1_750,
        },
        {
          workspaceId: workspaces.b.workspaceId,
          phone: "09120000012",
          kind: "device_ready",
          unitPriceRials: 1_750,
        },
      ],
    });

    await owner.smsTopup.createMany({
      data: [
        {
          workspaceId: workspaces.a.workspaceId,
          orderId: "DFXS-a",
          amountRials: 200_000,
        },
        {
          workspaceId: workspaces.b.workspaceId,
          orderId: "DFXS-b",
          amountRials: 500_000,
        },
      ],
    });

    const { messages, topups } = await runWithWorkspace(
      workspaces.a.workspaceId,
      async () => ({
        messages: await prisma.smsMessage.findMany(),
        topups: await prisma.smsTopup.findMany(),
      }),
    );

    // The phone number is the reason sms_messages is tenant data rather than
    // ledger; seeing another workshop's would be leaking their customer.
    expect(messages.map((row) => row.phone)).toEqual(["09120000011"]);
    expect(topups.map((row) => row.orderId)).toEqual(["DFXS-a"]);
  });

  it("allows one refund per message and no more", async () => {
    // The idempotency rule from 12.3, held in the database rather than in
    // the caller. Asserted here rather than in a unit test because a unique
    // index is not something a mock can have.
    const message = await owner.smsMessage.create({
      data: {
        workspaceId: workspaces.a.workspaceId,
        phone: "09120000013",
        kind: "device_delivered",
        unitPriceRials: 1_750,
        costRials: 3_500,
      },
      select: { id: true },
    });

    const refund = {
      workspaceId: workspaces.a.workspaceId,
      type: "refund" as const,
      smsMessageId: message.id,
      amountRials: 3_500,
      balanceBeforeRials: 0,
      balanceAfterRials: 3_500,
    };

    await runWithWorkspace(workspaces.a.workspaceId, () =>
      prisma.smsWalletTransaction.create({ data: refund }),
    );

    await expect(
      runWithWorkspace(workspaces.a.workspaceId, () =>
        prisma.smsWalletTransaction.create({ data: refund }),
      ),
    ).rejects.toThrow();
  });

  it("keeps the money and drops the phone number when a workspace is wiped", async () => {
    // 8.7 removes tenant data and leaves the ledger. sms_messages is on
    // DELETION_ORDER because of its phone column; the transaction that paid
    // for it is not, and survives with its amount and a null message.
    const message = await owner.smsMessage.create({
      data: {
        workspaceId: workspaces.a.workspaceId,
        phone: "09120000014",
        kind: "device_accepted",
        unitPriceRials: 1_750,
        costRials: 3_500,
      },
      select: { id: true },
    });

    await owner.smsWalletTransaction.create({
      data: {
        workspaceId: workspaces.a.workspaceId,
        type: "send",
        smsMessageId: message.id,
        amountRials: -3_500,
        balanceBeforeRials: 100_000,
        balanceAfterRials: 96_500,
      },
    });

    await owner.smsMessage.delete({ where: { id: message.id } });

    const rows = await owner.smsWalletTransaction.findMany({
      where: { workspaceId: workspaces.a.workspaceId },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].smsMessageId).toBeNull();
    expect(rows[0].amountRials.toNumber()).toBe(-3_500);
  });
});

// Reference data, like plans: the price is platform-wide, so there is no
// policy and the application role may only read it.
describe("sms_prices is reference data", () => {
  it("is readable by the application role and not writable", async () => {
    const read = await runWithWorkspace(workspaces.a.workspaceId, () =>
      prisma.smsPrice.findMany(),
    );

    // The opening row comes from the migration, and truncateAll() removes
    // it — so this asserts the grant rather than the contents.
    expect(Array.isArray(read)).toBe(true);

    await expect(
      runWithWorkspace(workspaces.a.workspaceId, () =>
        prisma.smsPrice.create({
          data: { unitPriceRials: 1, effectiveFrom: new Date() },
        }),
      ),
    ).rejects.toThrow();
  });
});
