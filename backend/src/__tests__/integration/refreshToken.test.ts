import request from "supertest";
import app from "../../app";
import prisma from "../../lib/prisma";
import { hashRefreshToken } from "../../utils/refreshToken";
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

const signUp = {
  workspace_name: "تعمیرگاه سوم",
  username: "09351112233",
  password: "testpass123",
};

/** Signs up and returns the session cookie the browser would have kept. */
async function newSession() {
  const res = await request(app).post("/api/auth/register").send(signUp);
  expect(res.status).toBe(201);

  const cookie = res.headers["set-cookie"][0];
  return {
    cookie,
    token: res.body.token,
    userId: res.body.user.id,
    workspaceId: res.body.user.workspace_id,
  };
}

/** The raw token value out of a Set-Cookie header. */
function tokenOf(cookie: string): string {
  return cookie.split(";")[0].split("=")[1];
}

describe("the refresh cookie", () => {
  it("is httpOnly, strict and scoped to the auth endpoints", async () => {
    const { cookie } = await newSession();

    // httpOnly is the whole reason this isn't in localStorage; the narrow
    // path keeps it off every ordinary API call.
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/api/auth");
  });

  it("is stored only as a hash", async () => {
    const { cookie, userId } = await newSession();
    const presented = tokenOf(cookie);

    const rows = await owner.refreshToken.findMany({
      where: { userId },
      select: { tokenHash: true },
    });

    expect(rows).toHaveLength(1);
    // A leaked dump has to contain nothing replayable.
    expect(rows[0].tokenHash).not.toBe(presented);
    expect(rows[0].tokenHash).toBe(hashRefreshToken(presented));
  });
});

describe("POST /api/auth/refresh", () => {
  it("works with no access token at all", async () => {
    const { cookie } = await newSession();

    // The endpoint is reached precisely when the access token has expired,
    // so it must not require one — app_refresh_lookup exists for this.
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    // Saves the client a follow-up /auth/me on every page load.
    expect(res.body.user.username).toBe(signUp.username);
  });

  it("issues a token that works on the next request", async () => {
    const { cookie } = await newSession();

    const refreshed = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie);

    const services = await request(app)
      .get("/api/services")
      .set("Authorization", `Bearer ${refreshed.body.token}`);

    expect(services.status).toBe(200);
    expect(services.body).toHaveLength(4);
  });

  it("rotates: the old cookie stops working and a new one arrives", async () => {
    const { cookie } = await newSession();

    const refreshed = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie);

    expect(refreshed.headers["set-cookie"][0]).not.toBe(cookie);

    const replay = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie);

    expect(replay.status).toBe(401);
  });

  it("ends every session for that user when a revoked token is replayed", async () => {
    const { cookie, userId } = await newSession();

    const rotated = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie);

    // Replaying the spent token says a copy is in circulation. Which of the
    // two holders is the thief is unknowable, so both are signed out.
    await request(app).post("/api/auth/refresh").set("Cookie", cookie);

    const stillLive = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", rotated.headers["set-cookie"][0]);

    expect(stillLive.status).toBe(401);

    const live = await owner.refreshToken.count({
      where: { userId, revokedAt: null },
    });
    expect(live).toBe(0);
  });

  it("leaves other users' sessions alone when one is compromised", async () => {
    const { cookie } = await newSession();

    // A second account, in a different workspace, signed in throughout.
    const other = await request(app)
      .post("/api/auth/register")
      .send({
        ...signUp,
        workspace_name: "تعمیرگاه چهارم",
        username: "09351112244",
      });

    await request(app).post("/api/auth/refresh").set("Cookie", cookie);
    await request(app).post("/api/auth/refresh").set("Cookie", cookie);

    const unaffected = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", other.headers["set-cookie"][0]);

    expect(unaffected.status).toBe(200);
  });

  it("refuses a token belonging to a deactivated account", async () => {
    const { cookie, userId } = await newSession();

    await owner.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    // Re-checked rather than trusted: the account may have been disabled
    // since the token was issued.
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie);

    expect(res.status).toBe(401);
  });

  it("refuses an expired token", async () => {
    const { cookie, userId } = await newSession();

    await owner.refreshToken.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie);

    expect(res.status).toBe(401);
  });

  it("refuses a token invented out of thin air", async () => {
    await newSession();

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", "dofixo_refresh=not-a-real-token");

    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("revokes the session it was given and no other", async () => {
    const first = await newSession();

    // A second sign-in for the same account, as a second device would be.
    const second = await request(app)
      .post("/api/auth/login")
      .send({ username: signUp.username, password: signUp.password });

    await request(app).post("/api/auth/logout").set("Cookie", first.cookie);

    const deadOne = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", first.cookie);
    const liveOne = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", second.headers["set-cookie"][0]);

    // Signing out on a phone shouldn't sign the shop's desktop out too —
    // including when the dead cookie is presented once more afterwards,
    // which a stale tab will do.
    expect(deadOne.status).toBe(401);
    expect(liveOne.status).toBe(200);
  });
});

describe("refresh tokens are tenant data like any other", () => {
  it("stays inside its own workspace", async () => {
    const { userId, workspaceId } = await newSession();

    const row = await owner.refreshToken.findFirstOrThrow({
      where: { userId },
      select: { workspaceId: true },
    });

    // The table carries workspace_id and has its own RLS policy, added in
    // the same migration — grants carry forward automatically, RLS does not.
    expect(row.workspaceId).toBe(workspaceId);
    expect(workspaceId).not.toBe(workspaces.a.workspaceId);
  });
});
