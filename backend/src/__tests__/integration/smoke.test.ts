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

// No jest.mock here, unlike every other test file: the whole point is that
// these queries reach Postgres and meet the RLS policies on the way.

let workspaces: TwoWorkspaces;

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
});

afterAll(async () => {
  await disconnectOwner();
  await prisma.$disconnect();
});

describe("integration plumbing", () => {
  it("connects as the unprivileged application role", async () => {
    // If this says dofixo, the app is running as the owner and every policy
    // is inert — the tests below would pass while proving nothing.
    const result = await prisma.$queryRaw<{ current_user: string }[]>`
      SELECT current_user
    `;

    const role = result[0]?.current_user;

    expect(role).toBe("dofixo_app");
  });

  // Two questions instead of one arithmetic identity. Counting policies
  // against tables held while every table was tenant-scoped; otp_codes is
  // not, so the sum now needs a second exception and a reader has to work
  // out which term each one belongs to. These ask directly, and each names
  // the table it is unhappy about instead of reporting a number that is off
  // by one.
  it("leaves no tenant-scoped table unprotected", async () => {
    const unprotected = await owner.$queryRaw<{ relname: string }[]>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND EXISTS (
          SELECT 1 FROM information_schema.columns col
          WHERE col.table_schema = 'public'
            AND col.table_name = c.relname
            AND col.column_name = 'workspace_id'
        )
        AND (
          NOT c.relrowsecurity
          OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
        )
      ORDER BY c.relname
    `;

    expect(unprotected.map((row) => row.relname)).toEqual([]);
  });

  it("shares only the tables that were chosen to be shared", async () => {
    // The mirror image, which the query above cannot see: a table with no
    // workspace_id is invisible to it, so one added by accident would pass
    // in silence. Four are expected, each for its own reason — the tenant
    // itself, reference data, Prisma's bookkeeping, and codes sent before
    // any workspace exists (OTP.1).
    const shared = await owner.$queryRaw<{ relname: string }[]>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns col
          WHERE col.table_schema = 'public'
            AND col.table_name = c.relname
            AND col.column_name = 'workspace_id'
        )
      ORDER BY c.relname
    `;

    expect(shared.map((row) => row.relname)).toEqual([
      "_prisma_migrations",
      "otp_codes",
      "roles",
      "workspaces",
    ]);
  });

  it("seeds two workspaces that can be told apart", async () => {
    expect(workspaces.a.workspaceId).not.toBe(workspaces.b.workspaceId);
  });
});

describe("a token reaches only its own workspace", () => {
  it("lists the caller's customers and nobody else's", async () => {
    await owner.customer.createMany({
      data: [
        {
          workspaceId: workspaces.a.workspaceId,
          name: "مشتری الف",
        },
        {
          workspaceId: workspaces.b.workspaceId,
          name: "مشتری ب",
        },
      ],
    });

    const res = await request(app)
      .get("/api/customers")
      .set("Authorization", `Bearer ${workspaces.a.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("مشتری الف");
  });
});
