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
import { GRACE_DAYS } from "../../utils/subscription";

// Not mocked, on purpose. The unit suites prove the middleware's rules; what
// only a real database and a real request can show is that the whole chain
// holds together — token, authenticate, the guard, and a query that has to
// come back through RLS as the caller's own workspace.

const DAY = 24 * 60 * 60 * 1000;

let workspaces: TwoWorkspaces;

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
});

afterAll(async () => {
  await disconnectOwner();
  await prisma.$disconnect();
});

/**
 * Written on the owner connection: the workspaces table denies UPDATE of
 * these columns to nothing in particular, but reaching around the API is the
 * point — there is no route that sets an expiry, and 8.5 is what will move
 * it forwards.
 */
async function setExpiry(
  workspaceId: number,
  daysFromNow: number,
  neverExpires = false,
) {
  await owner.workspace.update({
    where: { id: workspaceId },
    data: { expiresAt: new Date(Date.now() + daysFromNow * DAY), neverExpires },
  });
}

function post(token: string, path: string, body: object) {
  return request(app).post(path).set("Authorization", `Bearer ${token}`).send(body);
}

function get(token: string, path: string) {
  return request(app).get(path).set("Authorization", `Bearer ${token}`);
}

const newCustomer = { name: "مشتری تازه", phone: "09120000000" };

describe("a lapsed workspace", () => {
  beforeEach(async () => {
    await setExpiry(workspaces.a.workspaceId, -(GRACE_DAYS + 1));
  });

  it("cannot create anything", async () => {
    const res = await post(workspaces.a.token, "/api/customers", newCustomer);

    expect(res.status).toBe(402);
    expect(res.body.code).toBe("subscription_expired");
    expect(await owner.customer.count()).toBe(0);
  });

  it("still sees everything it had", async () => {
    await owner.customer.create({
      data: { workspaceId: workspaces.a.workspaceId, name: "مشتری قدیمی" },
    });

    const res = await get(workspaces.a.token, "/api/customers");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("cannot edit or delete either", async () => {
    const customer = await owner.customer.create({
      data: { workspaceId: workspaces.a.workspaceId, name: "مشتری قدیمی" },
      select: { id: true },
    });

    const edited = await request(app)
      .put(`/api/customers/${customer.id}`)
      .set("Authorization", `Bearer ${workspaces.a.token}`)
      .send({ name: "نام تازه" });

    const removed = await request(app)
      .delete(`/api/customers/${customer.id}`)
      .set("Authorization", `Bearer ${workspaces.a.token}`);

    expect(edited.status).toBe(402);
    expect(removed.status).toBe(402);
  });

  it("leaves the workspace next door working normally", async () => {
    // The guard reads the workspace from the caller's own token, so one
    // shop's lapse cannot touch another's — but this is cheap to prove and
    // expensive to get wrong.
    const res = await post(workspaces.b.token, "/api/customers", newCustomer);

    expect(res.status).toBe(201);
  });
});

describe("the grace period", () => {
  it("keeps writes working for the first few days past expiry", async () => {
    await setExpiry(workspaces.a.workspaceId, -1);

    const res = await post(workspaces.a.token, "/api/customers", newCustomer);

    expect(res.status).toBe(201);
  });

  it("closes once it runs out", async () => {
    await setExpiry(workspaces.a.workspaceId, -(GRACE_DAYS + 1));

    const res = await post(workspaces.a.token, "/api/customers", newCustomer);

    expect(res.status).toBe(402);
  });
});

describe("what stays open to a lapsed workspace", () => {
  beforeEach(async () => {
    await setExpiry(workspaces.a.workspaceId, -(GRACE_DAYS + 1));
  });

  it("lets the owner change their password", async () => {
    // Whoever is trying to get back in and pay must not be locked out of
    // their own account on the way.
    const res = await request(app)
      .put("/api/auth/change-password")
      .set("Authorization", `Bearer ${workspaces.a.token}`)
      .send({ current_password: "wrong-on-purpose", new_password: "newpass123" });

    // Anything but 402: the password itself is wrong, which is the
    // controller answering rather than the guard refusing to let it try.
    expect(res.status).not.toBe(402);
  });

  it("lets it list its past exports but not build a new one", async () => {
    const listed = await get(workspaces.a.token, "/api/exports");
    expect(listed.status).toBe(200);

    const built = await post(workspaces.a.token, "/api/exports", {
      include_images: false,
    });
    expect(built.status).toBe(402);
  });
});

describe("a workspace flagged never to expire", () => {
  it("keeps writing however long ago its date passed", async () => {
    // Ours and any demo account. Set with psql; there is no route for it.
    await setExpiry(workspaces.a.workspaceId, -500, true);

    const res = await post(workspaces.a.token, "/api/customers", newCustomer);

    expect(res.status).toBe(201);
  });
});

describe("a workspace with no expiry at all", () => {
  it("is refused rather than treated as unlimited", async () => {
    // app_create_workspace leaves it null and startTrial fills it in one
    // statement later, in the same transaction — so this state should never
    // be reachable. Fail closed if it ever is.
    await owner.workspace.update({
      where: { id: workspaces.a.workspaceId },
      data: { expiresAt: null, neverExpires: false },
    });

    const res = await post(workspaces.a.token, "/api/customers", newCustomer);

    expect(res.status).toBe(402);
  });
});
