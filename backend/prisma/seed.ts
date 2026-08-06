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

// Mirrors what initSchema() in the old sql.js layer inserted on first boot:
// the three roles, one super admin, the single settings row, and the four
// default services that serviceController used to create lazily at runtime.
async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error(
      "SEED_ADMIN_PASSWORD is not set. Refusing to seed a super admin with a " +
        "predictable password — set it in backend/.env first.",
    );
  }

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

  await prisma.user.upsert({
    where: { username: "superadmin" },
    // Password is left alone on re-seed so an already-changed password isn't
    // silently reset back to the env value.
    update: {},
    create: {
      fullName: "سوپر ادمین",
      username: "superadmin",
      password: await bcrypt.hash(adminPassword, 10),
      roleId: superAdminRole.id,
    },
  });

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
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

  // services.name has no unique constraint (it didn't in SQLite either), so
  // upsert isn't available — seed only when the table is empty, matching the
  // old controller's `count === 0` guard.
  const serviceCount = await prisma.service.count();
  if (serviceCount === 0) {
    await prisma.service.createMany({ data: services });
  }

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
