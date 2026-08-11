import bcrypt from "bcryptjs";
import type { Prisma } from "../generated/prisma/client";

/**
 * The services a repair shop is assumed to charge for on day one.
 *
 * Seeded rather than left empty so the first repair invoice has something to
 * pick from; every one of them is editable and deletable afterwards.
 */
export const DEFAULT_SERVICES = [
  { name: "دستمزد تعمیر", description: "هزینه تعمیر دستگاه" },
  { name: "هزینه تست و عیب‌یابی", description: "بررسی اولیه دستگاه" },
  { name: "هزینه نصب قطعه", description: "نصب قطعات روی برد" },
  { name: "هزینه برنامه‌ریزی", description: "برنامه‌ریزی آی‌سی و میکروکنترلر" },
] as const;

/**
 * Stands in until the owner edits it from the personnel page.
 *
 * Sign-up asks for a phone, a password and a shop name — not a person's
 * name. Putting the shop's name here instead would leave a row in the
 * personnel list that reads as a human being, which stops making sense the
 * moment a second user is added.
 */
const DEFAULT_FULL_NAME = "مدیر";

const rolesInclude = {
  role: { select: { name: true, label: true } },
} satisfies Prisma.UserInclude;

export type NewWorkspaceOwner = Prisma.UserGetPayload<{
  include: typeof rolesInclude;
}>;

/**
 * Fills a freshly created workspace with everything it needs to be usable:
 * its owner, a settings row and the default services.
 *
 * Takes a transaction client rather than the shared one, because all of this
 * has to land with the workspace itself — a tenant that exists with no user
 * in it can neither be signed into nor found again.
 *
 * Shared by sign-up and prisma/seed.ts so "what a new workspace looks like"
 * is answered in one place rather than drifting between two.
 */
export async function populateWorkspace(
  tx: Prisma.TransactionClient,
  workspaceId: number,
  input: { workspaceName: string; username: string; password: string },
): Promise<NewWorkspaceOwner> {
  // Reference data shared by every workspace, so it is read rather than
  // created — the seed puts the three roles in once.
  const superAdmin = await tx.role.findUniqueOrThrow({
    where: { name: "super_admin" },
    select: { id: true },
  });

  const owner = await tx.user.create({
    data: {
      workspaceId,
      fullName: DEFAULT_FULL_NAME,
      username: input.username,
      password: await bcrypt.hash(input.password, 10),
      roleId: superAdmin.id,
    },
    include: rolesInclude,
  });

  // Required, not optional: updateSettings does a bare update(), so without
  // this row the first time an owner saves their settings would fail.
  await tx.settings.create({
    data: {
      workspaceId,
      // The shop's own name rather than a generic placeholder — this is what
      // prints at the top of every invoice.
      companyName: input.workspaceName,
    },
  });

  await tx.service.createMany({
    data: DEFAULT_SERVICES.map((service) => ({ ...service, workspaceId })),
  });

  return owner;
}
