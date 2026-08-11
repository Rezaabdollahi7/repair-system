import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { populateWorkspace } from "../src/utils/newWorkspace";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

// The owner connection, not DATABASE_URL_APP: seeding writes the shared role
// rows, which the application role is deliberately not allowed to touch.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const DEFAULT_WORKSPACE = "کارگاه پیش‌فرض";

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error(
      "SEED_ADMIN_PASSWORD is not set. Refusing to seed a super admin with a " +
        "predictable password — set it in backend/.env first.",
    );
  }

  const adminUsername = process.env.SEED_ADMIN_USERNAME;
  if (!adminUsername || !/^09\d{9}$/.test(adminUsername)) {
    throw new Error(
      "SEED_ADMIN_USERNAME must be an Iranian mobile number (09xxxxxxxxx). " +
        "The username is a phone number since task 3.1, so the old " +
        '"superadmin" value can no longer be signed in with.',
    );
  }

  // Roles are reference data shared by every workspace, so they're seeded
  // once and carry no workspaceId. They also have to exist before any
  // workspace, since its owner needs one.
  const roles = [
    { name: "super_admin", label: "سوپر ادمین" },
    { name: "admin", label: "ادمین" },
    { name: "technician", label: "تکنسین" },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { label: role.label },
      create: role,
    });
  }

  // No natural key to upsert on — a workspace name isn't unique — so an
  // existing one is left alone rather than duplicated on a re-seed.
  const existing = await prisma.workspace.findFirst({
    orderBy: { id: "asc" },
    select: { id: true },
  });

  if (existing) {
    console.log(`Seed complete. Workspace ${existing.id} already existed.`);
    return;
  }

  const workspaceId = await prisma.$transaction(async (tx) => {
    // The same function sign-up calls, rather than a plain insert: the trial
    // status and expiry are defined there, and a second definition here
    // would drift from it the first time either changed.
    const [created] = await tx.$queryRaw<{ app_create_workspace: number }[]>`
      SELECT app_create_workspace(${DEFAULT_WORKSPACE})
    `;

    const id = created.app_create_workspace;

    // Also the same helper sign-up uses, so a seeded workspace and a
    // registered one are furnished identically.
    await populateWorkspace(tx, id, {
      workspaceName: DEFAULT_WORKSPACE,
      username: adminUsername,
      password: adminPassword,
    });

    return id;
  });

  console.log(
    `Seed complete. Workspace ${workspaceId}, sign in as ${adminUsername}.`,
  );
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
