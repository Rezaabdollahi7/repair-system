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

  it("has row-level security enabled on the test database", async () => {
    const result = await owner.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
    `;

    expect(Number(result[0]?.count)).toBe(19);
  });

  it("seeds two workspaces that can be told apart", async () => {
    expect(workspaces.a.workspaceId).not.toBe(workspaces.b.workspaceId);
  });
});

describe("a token reaches only its own workspace", () => {
  it("lists the caller's customers and nobody else's", async () => {
    await owner.customer.createMany({
      data: [
        { workspaceId: workspaces.a.workspaceId, name: "مشتری الف" },
        { workspaceId: workspaces.b.workspaceId, name: "مشتری ب" },
      ],
    });

    const res = await request(app)
      .get("/api/customers")
      .set("Authorization", `Bearer ${workspaces.a.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("مشتری الف");
  });
}); // ← فقط یک }); اینجا کافی است
