import request from "supertest";
import app from "../../app";
import prisma from "../../lib/prisma";
import { hashOtpCode } from "../../utils/otp";
import {
  disconnectOwner,
  issueCode,
  owner,
  seedTwoWorkspaces,
  TEST_OTP_CODE,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

// Not mocked, because what is worth proving here is that the transaction
// committed: the password works on the next login and the sessions are gone.
// A mock can show the calls were made; only a database shows they landed.

let workspaces: TwoWorkspaces;

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
});

afterAll(async () => {
  await disconnectOwner();
  await prisma.$disconnect();
});

const PHONE = "09351112233";
const OLD_PASSWORD = "testpass123";
const NEW_PASSWORD = "brandnew456";
const RESET_CODE = "54321";

/** A signed-up account with a live session, which is what a reset undoes. */
async function accountWithSession() {
  await issueCode(PHONE);
  const res = await request(app).post("/api/auth/register").send({
    workspace_name: "تعمیرگاه سوم",
    username: PHONE,
    password: OLD_PASSWORD,
    code: TEST_OTP_CODE,
  });

  expect(res.status).toBe(201);
  return {
    userId: res.body.user.id,
    workspaceId: res.body.user.workspace_id,
    cookie: res.headers["set-cookie"][0],
  };
}

/** A reset code, which is a different row from the register one. */
async function issueResetCode(phone = PHONE, code = RESET_CODE) {
  await owner.otpCode.create({
    data: {
      phone,
      purpose: "reset",
      codeHash: hashOtpCode(code),
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
}

function resetPassword(body: Record<string, unknown> = {}) {
  return request(app).post("/api/auth/reset-password").send({
    phone: PHONE,
    code: RESET_CODE,
    new_password: NEW_PASSWORD,
    ...body,
  });
}

describe("password reset", () => {
  it("lets the new password sign in and the old one not", async () => {
    await accountWithSession();
    await issueResetCode();

    expect((await resetPassword()).status).toBe(200);

    const withNew = await request(app)
      .post("/api/auth/login")
      .send({ username: PHONE, password: NEW_PASSWORD });
    expect(withNew.status).toBe(200);

    const withOld = await request(app)
      .post("/api/auth/login")
      .send({ username: PHONE, password: OLD_PASSWORD });
    expect(withOld.status).toBe(401);
  });

  it("ends the session that was open at the time", async () => {
    const { cookie } = await accountWithSession();
    await issueResetCode();

    await resetPassword();

    // Whoever was holding this cookie is out, which is the point when the
    // reset was prompted by somebody else being in the account.
    const refresh = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie);

    expect(refresh.status).toBe(401);
  });

  it("writes under the policies, not around them", async () => {
    // The workspace comes from app_login_lookup and is handed to
    // runInWorkspaceTransaction. If it were wrong or missing, the update
    // would match no rows and the reset would report success while changing
    // nothing — so the login above is what actually tests this, and this
    // reads the row to say so plainly.
    const { userId } = await accountWithSession();
    await issueResetCode();

    const before = await owner.user.findUniqueOrThrow({
      where: { id: userId },
      select: { password: true },
    });

    await resetPassword();

    const after = await owner.user.findUniqueOrThrow({
      where: { id: userId },
      select: { password: true },
    });

    expect(after.password).not.toBe(before.password);
  });

  it("spends the code, so it cannot be used twice", async () => {
    await accountWithSession();
    await issueResetCode();

    expect((await resetPassword()).status).toBe(200);

    const second = await resetPassword({ new_password: "thirdpass789" });
    expect(second.status).toBe(400);

    // The second attempt must not have taken effect either.
    const stillNew = await request(app)
      .post("/api/auth/login")
      .send({ username: PHONE, password: NEW_PASSWORD });
    expect(stillNew.status).toBe(200);
  });

  it("will not accept a register code in place of a reset one", async () => {
    // Two purposes, two rows. A code issued to verify a new number must not
    // open an account that already exists.
    await accountWithSession();
    await issueCode(PHONE, RESET_CODE);

    const res = await resetPassword();

    expect(res.status).toBe(400);
  });

  it("changes nothing for a number with no account", async () => {
    await accountWithSession();
    await issueResetCode("09121110000");

    const res = await resetPassword({ phone: "09121110000" });

    expect(res.status).toBe(400);
    // The account that does exist is untouched.
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: PHONE, password: OLD_PASSWORD });
    expect(login.status).toBe(200);
  });

  it("touches only the account whose number was given", async () => {
    // seedTwoWorkspaces made two other users; a reset scoped by nothing
    // would be a way to change any of them.
    await accountWithSession();
    await issueResetCode();

    const before = await owner.user.findUniqueOrThrow({
      where: { id: workspaces.a.userId },
      select: { password: true },
    });

    await resetPassword();

    const after = await owner.user.findUniqueOrThrow({
      where: { id: workspaces.a.userId },
      select: { password: true },
    });

    expect(after.password).toBe(before.password);
  });
});
