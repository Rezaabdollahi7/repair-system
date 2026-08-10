import { PrismaPg } from "@prisma/adapter-pg";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../../generated/prisma/client";
import { JWT_SECRET } from "../../middleware/auth";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is not set — see jest.integration.setup.ts.",
  );
}

/**
 * A client on the owner connection, which bypasses RLS.
 *
 * Fixtures have to write rows into two different workspaces, which is
 * precisely what the policies forbid — so seeding cannot go through the
 * application client. Tests assert through the app; only setup uses this.
 */
export const owner = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

/**
 * Empties every table between tests.
 *
 * Table names are read from the catalogue rather than listed here, so a model
 * added later is cleaned up without anyone remembering to update this list —
 * a stale row surviving into the next test is the kind of failure that looks
 * like a logic bug for an hour.
 */
export async function truncateAll() {
  const tables = await owner.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  const quoted = tables.map((t) => `"${t.tablename}"`).join(", ");

  // RESTART IDENTITY so ids are predictable per test; CASCADE because the
  // tables reference each other and order would otherwise matter.
  await owner.$executeRawUnsafe(
    `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
  );
}

export interface SeededWorkspace {
  workspaceId: number;
  userId: number;
  token: string;
}

export interface TwoWorkspaces {
  a: SeededWorkspace;
  b: SeededWorkspace;
}

/**
 * Two workspaces, each with its own super admin and a signed token.
 *
 * Two rather than one because a single tenant proves nothing: isolation only
 * shows up when there is something on the other side to leak.
 */
export async function seedTwoWorkspaces(): Promise<TwoWorkspaces> {
  const roles = [
    { name: "super_admin", label: "سوپر ادمین" },
    { name: "admin", label: "ادمین" },
    { name: "technician", label: "تکنسین" },
  ];

  for (const role of roles) {
    await owner.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
  }

  const superAdmin = await owner.role.findUniqueOrThrow({
    where: { name: "super_admin" },
  });

  // One hash for both, computed once: bcrypt is deliberately slow and these
  // accounts are never logged into through the password path.
  const password = await bcrypt.hash("integration-test", 10);

  async function createWorkspace(
    name: string,
    username: string,
  ): Promise<SeededWorkspace> {
    const workspace = await owner.workspace.create({
      data: { name, status: "trial" },
      select: { id: true },
    });

    const user = await owner.user.create({
      data: {
        workspaceId: workspace.id,
        fullName: name,
        username,
        password,
        roleId: superAdmin.id,
      },
      select: { id: true },
    });

    // Minted directly rather than through /auth/login: what these tests are
    // about is what a valid token can reach, not how it was obtained.
    const token = jwt.sign(
      {
        id: user.id,
        workspaceId: workspace.id,
        username,
        role: "super_admin",
        isActive: true,
      },
      JWT_SECRET,
      { expiresIn: "1h" },
    );

    return { workspaceId: workspace.id, userId: user.id, token };
  }

  return {
    a: await createWorkspace("کارگاه الف", "09120000001"),
    b: await createWorkspace("کارگاه ب", "09120000002"),
  };
}

/** Closes the fixture connection so Jest doesn't hang on an open pool. */
export async function disconnectOwner() {
  await owner.$disconnect();
}
