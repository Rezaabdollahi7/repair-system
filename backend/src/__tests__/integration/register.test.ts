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
import { issueCode, TEST_OTP_CODE } from "./helpers";
import { TRIAL_DAYS } from "../../utils/subscription";

// Not mocked: app_create_workspace is a SECURITY DEFINER function and the
// rows that follow it are written under the policies. Neither exists in a
// mocked test, so nothing until now has exercised either.

let existing: TwoWorkspaces;

beforeEach(async () => {
  await truncateAll();
  // Also seeds the three roles, which a new workspace's owner needs.
  existing = await seedTwoWorkspaces();
});

afterAll(async () => {
  await disconnectOwner();
  await prisma.$disconnect();
});

const signUp = {
  workspace_name: "تعمیرگاه سوم",
  username: "09351112233",
  password: "testpass123",
  code: TEST_OTP_CODE,
};

/**
 * Signs up, issuing the code first unless the caller is testing what happens
 * without one. Every existing test below predates OTP.4 and assumes sign-up
 * just works, so the code is arranged for them rather than written into each.
 */
async function register(body: Record<string, unknown> = signUp) {
  const phone = String(body.username ?? signUp.username);
  await issueCode(phone);
  return request(app).post("/api/auth/register").send(body);
}

describe("sign-up", () => {
  it("creates a workspace the application role could not insert itself", async () => {
    const res = await register();

    expect(res.status).toBe(201);

    // The workspaces table denies INSERT to dofixo_app on purpose (task 2.3):
    // creating a tenant is not an ordinary request. Reaching this line means
    // the SECURITY DEFINER function is the only thing that got it through.
    const workspaceId = res.body.user.workspace_id;
    const workspace = await owner.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { name: true, status: true, expiresAt: true },
    });

    expect(workspace.name).toBe(signUp.workspace_name);
    expect(workspace.status).toBe("trial");
    expect(workspace.expiresAt).not.toBeNull();
  });

  it("starts the trial roughly a month out", async () => {
    const res = await register();

    const workspace = await owner.workspace.findUniqueOrThrow({
      where: { id: res.body.user.workspace_id },
      select: { expiresAt: true },
    });

    // Enforcing the expiry is task 8.3; this only checks the date was
    // recorded, so no workspace exists without an answer to "until when".
    //
    // Compared against TRIAL_DAYS rather than a hand-written range, and
    // tightly: this test is what caught the trial being granted twice, once
    // by app_create_workspace and once by startTrial. A window wide enough
    // to hold both numbers would have said nothing.
    const daysOut =
      (workspace.expiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(daysOut).toBeGreaterThan(TRIAL_DAYS - 1);
    expect(daysOut).toBeLessThanOrEqual(TRIAL_DAYS);
  });

  it("furnishes the workspace with a settings row and the default services", async () => {
    const res = await register();
    const workspaceId = res.body.user.workspace_id;

    const [settings, services] = await Promise.all([
      owner.settings.findUnique({
        where: { workspaceId },
        select: { companyName: true },
      }),
      owner.service.count({ where: { workspaceId } }),
    ]);

    // Without the settings row, the first time this owner saved their
    // settings would fail — updateSettings does a bare update().
    expect(settings?.companyName).toBe(signUp.workspace_name);
    expect(services).toBe(4);
  });

  it("issues a token that works on the next request", async () => {
    const res = await register();

    const services = await request(app)
      .get("/api/services")
      .set("Authorization", `Bearer ${res.body.token}`);

    expect(services.status).toBe(200);
    expect(services.body).toHaveLength(4);
  });

  it("normalises the phone, so either script signs in", async () => {
    // Persian digits going in, latin digits coming back out — and the login
    // below proves the two forms reach the same row.
    // The code is stored against the normalised number, because that is what
    // send-otp would have written after phoneSchema ran on its input too.
    await issueCode("09351112233");
    const created = await request(app)
      .post("/api/auth/register")
      .send({ ...signUp, username: "۰۹۳۵۱۱۱۲۲۳۳" });
    expect(created.body.user.username).toBe("09351112233");
    expect(created.body.user.username).toBe("09351112233");

    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "09351112233", password: signUp.password });

    expect(login.status).toBe(200);
    expect(login.body.user.workspace_id).toBe(created.body.user.workspace_id);
  });
});

describe("sign-up failures", () => {
  it("rejects an already-registered phone with 409", async () => {
    await register();
    const second = await register({
      ...signUp,
      workspace_name: "تعمیرگاه چهارم",
    });

    expect(second.status).toBe(409);
  });

  it("leaves no orphan workspace behind when the user cannot be created", async () => {
    await register();
    const before = await owner.workspace.count();

    await register({ ...signUp, workspace_name: "تعمیرگاه چهارم" });

    // app_create_workspace runs before the user insert that fails, so the
    // transaction has to take the workspace back with it. A workspace with
    // no user in it can be neither signed into nor found again — it would
    // just sit there.
    expect(await owner.workspace.count()).toBe(before);
    expect(
      await owner.workspace.count({ where: { name: "تعمیرگاه چهارم" } }),
    ).toBe(0);
  });
});

describe("a new workspace is isolated from the ones already there", () => {
  beforeEach(async () => {
    await owner.customer.createMany({
      data: [
        { workspaceId: existing.a.workspaceId, name: "مشتری الف" },
        { workspaceId: existing.b.workspaceId, name: "مشتری ب" },
      ],
    });
  });

  it("sees none of their data", async () => {
    const res = await register();

    const customers = await request(app)
      .get("/api/customers")
      .set("Authorization", `Bearer ${res.body.token}`);

    expect(customers.status).toBe(200);
    expect(customers.body.data).toHaveLength(0);
  });

  it("stays invisible to them", async () => {
    const res = await register();

    // Written on the owner connection, since the new workspace's own token
    // is the only one that could write it through the API.
    await owner.customer.create({
      data: { workspaceId: res.body.user.workspace_id, name: "مشتری سوم" },
    });

    const fromA = await request(app)
      .get("/api/customers")
      .set("Authorization", `Bearer ${existing.a.token}`);

    const names = fromA.body.data.map((row: { name: string }) => row.name);
    expect(names).toEqual(["مشتری الف"]);
  });

  it("numbers its invoices from its own counter", async () => {
    // Counters live on the workspace row, so a fresh tenant opens its books
    // at 0001 however many invoices the platform has issued elsewhere.
    const res = await register();
    const workspaceId = res.body.user.workspace_id;

    const item = await owner.item.create({
      data: { workspaceId, name: "خازن", code: "C-100" },
      select: { id: true },
    });

    const invoice = await request(app)
      .post("/api/purchase-invoices")
      .set("Authorization", `Bearer ${res.body.token}`)
      .send({
        supplier_name: "تأمین‌کننده",
        paid_amount: 1000,
        note: null,
        items: [{ item_id: item.id, quantity: 1, unit_price: 1000 }],
      });

    expect(invoice.status).toBe(201);
    expect(invoice.body.invoice_number).toBe("PUR-0001");
  });
});

// The unit tests cover which codes are refused. What only a real database can
// show is that the transaction committed: the code is spent, and stays spent.
describe("the code is spent against a real database", () => {
  it("marks the code consumed when the workspace is created", async () => {
    const res = await register();
    expect(res.status).toBe(201);

    const row = await owner.otpCode.findFirstOrThrow({
      where: { phone: signUp.username },
      orderBy: { id: "desc" },
      select: { consumedAt: true },
    });

    // Written inside the same transaction as the workspace, so seeing it
    // here means both landed.
    expect(row.consumedAt).not.toBeNull();
  });

  it("will not create a second workspace from the same code", async () => {
    await register();
    const before = await owner.workspace.count();

    // Straight to the endpoint, without issuing a fresh code: the row from
    // the first sign-up is there, and consumed.
    const second = await request(app)
      .post("/api/auth/register")
      .send({ ...signUp, username: "09351112244" });

    expect(second.status).toBe(400);
    expect(await owner.workspace.count()).toBe(before);
  });

  it("creates nothing without a code at all", async () => {
    const before = await owner.workspace.count();

    const res = await request(app).post("/api/auth/register").send(signUp);

    expect(res.status).toBe(400);
    expect(await owner.workspace.count()).toBe(before);
  });

  it("leaves the code usable when the number was taken in between", async () => {
    // The reason the code is spent inside the transaction rather than before
    // it. Someone registers this number in the seconds between send-otp and
    // register; the sign-up fails on the unique constraint, and the code has
    // to come back with it — otherwise a legitimate caller has burned one of
    // three allowances on somebody else's race.
    await register();

    await issueCode(signUp.username, "54321");
    const taken = await request(app)
      .post("/api/auth/register")
      .send({ ...signUp, workspace_name: "تعمیرگاه پنجم", code: "54321" });

    expect(taken.status).toBe(409);

    const row = await owner.otpCode.findFirstOrThrow({
      where: { phone: signUp.username },
      orderBy: { id: "desc" },
      select: { consumedAt: true },
    });

    expect(row.consumedAt).toBeNull();
  });
});
