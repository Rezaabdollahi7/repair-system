import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

// Everything below hangs off one workspace. Self-serve sign-up arrives in
// phase 3; until then this is the only tenant, and it exists so the app has
// something to run against locally.
const DEFAULT_WORKSPACE = "کارگاه پیش‌فرض";

const TRIAL_MONTHS = 1;

function trialExpiry(): Date {
  const expires = new Date();
  expires.setMonth(expires.getMonth() + TRIAL_MONTHS);
  return expires;
}

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error(
      "SEED_ADMIN_PASSWORD is not set. Refusing to seed a super admin with a " +
        "predictable password — set it in backend/.env first.",
    );
  }

  // Roles are reference data shared by every workspace, so they're seeded
  // once and carry no workspaceId.
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

  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { name: "super_admin" },
  });

  // No natural key to upsert on — a workspace name isn't unique — so the
  // first one is reused if it's already there.
  const existing = await prisma.workspace.findFirst({
    orderBy: { id: "asc" },
    select: { id: true },
  });

  const workspace =
    existing ??
    (await prisma.workspace.create({
      data: {
        name: DEFAULT_WORKSPACE,
        status: "trial",
        expiresAt: trialExpiry(),
      },
      select: { id: true },
    }));

  await prisma.user.upsert({
    where: { username: "superadmin" },
    // Password is left alone on re-seed so an already-changed password isn't
    // silently reset back to the env value.
    update: {},
    create: {
      workspaceId: workspace.id,
      fullName: "سوپر ادمین",
      username: "superadmin",
      password: await bcrypt.hash(adminPassword, 10),
      roleId: superAdminRole.id,
    },
  });

  await prisma.settings.upsert({
    where: { workspaceId: workspace.id },
    update: {},
    create: {
      workspaceId: workspace.id,
      companyName: "تعمیرگاه",
      defaultTaxRate: 0,
      defaultWarrantyMonths: 3,
      invoicePrefix: "INV-",
    },
  });

  const services = [
    { name: "دستمزد تعمیر", description: "هزینه تعمیر دستگاه" },
    { name: "هزینه تست و عیب‌یابی", description: "بررسی اولیه دستگاه" },
    { name: "هزینه نصب قطعه", description: "نصب قطعات روی برد" },
    {
      name: "هزینه برنامه‌ریزی",
      description: "برنامه‌ریزی آی‌سی و میکروکنترلر",
    },
  ];

  // Service names aren't unique, so upsert isn't available — seeded only
  // when this workspace has none, matching what the old controller did.
  const serviceCount = await prisma.service.count({
    where: { workspaceId: workspace.id },
  });

  if (serviceCount === 0) {
    await prisma.service.createMany({
      data: services.map((service) => ({
        ...service,
        workspaceId: workspace.id,
      })),
    });
  }

  console.log(`Seed complete. Workspace id: ${workspace.id}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
