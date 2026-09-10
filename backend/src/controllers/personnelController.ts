import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import prisma from "../lib/prisma";
import type { Prisma } from "../generated/prisma/client";
import { ValidatedRequest } from "../middleware/validate";
import { AuthenticatedRequest } from "../types/request";
import { errorMessage } from "../utils/errors";
import persianToEnglish from "../utils/persianToEnglish";
import type { IdParam } from "../schemas/common";
import type {
  PersonnelCreateBody,
  PersonnelListQuery,
  PersonnelUpdateBody,
} from "../schemas/personnel";
import { workspaceIdOf } from "../utils/workspace";
import {
  jalaliMonthLabel,
  jalaliYearMonth,
  lastJalaliMonths,
} from "../utils/jalali";
import {
  CONCLUDED_STATUSES,
  isActive,
  SUCCESSFUL_STATUSES,
} from "../utils/deviceStatus";

// Never selects the password column, so a hash can't leak into a response by
// accident the way `SELECT *` would allow.
const personnelSelect = {
  id: true,
  workspaceId: true,
  fullName: true,
  username: true,
  phone: true,
  avatar: true,
  roleId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { name: true, label: true } },
} satisfies Prisma.UserSelect;

type PersonnelRow = Prisma.UserGetPayload<{ select: typeof personnelSelect }>;

// Hand-mapped rather than serialized: the role relation is flattened into
// role_name/role_label, which isn't a plain column rename.
function toPersonnelResponse(user: PersonnelRow) {
  return {
    id: user.id,
    workspace_id: user.workspaceId,
    full_name: user.fullName,
    username: user.username,
    phone: user.phone,
    avatar: user.avatar,
    role_id: user.roleId,
    is_active: user.isActive,
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
    role_name: user.role.name,
    role_label: user.role.label,
  };
}

/**
 * An admin may only ever act on technicians; a super admin has no such limit.
 * Returns an error message when the action is refused, or null when allowed.
 */
function roleRestriction(
  actorRole: string | undefined,
  targetRoleName: string,
  message: string,
): string | null {
  if (actorRole === "admin" && targetRoleName !== "technician") {
    return message;
  }
  return null;
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** How many months the performance chart looks back. */
const CHART_MONTHS = 12;

// GET /api/personnel/:id/overview
export const getOverview = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;
    const workspaceId = workspaceIdOf(req);

    // findFirst, not findUnique: the id alone would resolve a user in
    // another workspace.
    const personnel = await prisma.user.findFirst({
      where: { id, workspaceId },
      select: personnelSelect,
    });

    if (!personnel) {
      return res.status(404).json({ error: "کاربر یافت نشد" });
    }

    /*
     * Read through the assignments rather than through devices: a device
     * carries no technician column, and the same device may be assigned to
     * more than one person. `assignedAt` is worth having — it is when the
     * job landed on this person's bench, which is not the intake date.
     */
    const assignments = await prisma.deviceAssignment.findMany({
      where: { personnelId: id, workspaceId },
      orderBy: { assignedAt: "desc" },
      select: {
        assignedAt: true,
        device: {
          select: {
            id: true,
            deviceName: true,
            brand: true,
            model: true,
            status: true,
            entryDate: true,
            exitDate: true,
            createdAt: true,
          },
        },
      },
    });

    const devices = assignments.map((assignment) => assignment.device);

    /*
     * Turnaround, over the jobs that have both ends. A device still open
     * has no duration yet — counting it as zero would drag the average
     * towards a speed nobody achieved.
     */
    const durations = devices
      .filter((device) => device.entryDate && device.exitDate)
      .map(
        (device) =>
          (device.exitDate!.getTime() - device.entryDate!.getTime()) /
          MILLISECONDS_PER_DAY,
      );

    const averageDays =
      durations.length > 0
        ? durations.reduce((sum, days) => sum + days, 0) / durations.length
        : null;

    // Only the statuses this person actually has, so the ring has no empty
    // slices — the frontend supplies the label and the colour.
    const counts = new Map<string, number>();
    for (const device of devices) {
      counts.set(device.status, (counts.get(device.status) ?? 0) + 1);
    }

    /*
     * The monthly chart counts jobs by the month they *left*, bucketed by
     * Jalali month because that is the calendar the shop reads. A device
     * with no exit date has not been completed and belongs in no month.
     */
    const months = lastJalaliMonths(CHART_MONTHS);
    const monthlyCounts = new Map<string, number>();

    for (const device of devices) {
      if (!device.exitDate) continue;

      const { jy, jm } = jalaliYearMonth(device.exitDate);
      const key = `${jy}-${jm}`;
      monthlyCounts.set(key, (monthlyCounts.get(key) ?? 0) + 1);
    }

    res.json({
      personnel: toPersonnelResponse(personnel),
      kpi: {
        active_devices: devices.filter((device) => isActive(device.status))
          .length,
        completed_repairs: devices.filter((device) =>
          CONCLUDED_STATUSES.includes(device.status),
        ).length,
        successful_repairs: devices.filter((device) =>
          SUCCESSFUL_STATUSES.includes(device.status),
        ).length,
        // A number, not the fixed-precision string the old customer stats
        // returned: rounding is the frontend's job everywhere else.
        avg_repair_days: averageDays,
      },
      status_breakdown: [...counts.entries()].map(([status, count]) => ({
        status,
        count,
      })),
      history: assignments.map(({ assignedAt, device }) => ({
        device_id: device.id,
        device_name: device.deviceName,
        brand: device.brand,
        model: device.model,
        status: device.status,
        entry_date: (device.entryDate ?? device.createdAt).toISOString(),
        exit_date: device.exitDate?.toISOString() ?? null,
        repair_days:
          device.entryDate && device.exitDate
            ? Math.round(
                (device.exitDate.getTime() - device.entryDate.getTime()) /
                  MILLISECONDS_PER_DAY,
              )
            : null,
        assigned_at: assignedAt.toISOString(),
      })),
      monthly: months.map((month) => ({
        jy: month.jy,
        jm: month.jm,
        label: jalaliMonthLabel(month),
        count: monthlyCounts.get(`${month.jy}-${month.jm}`) ?? 0,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/personnel
export const getAll = async (req: Request, res: Response) => {
  try {
    const query = (req as ValidatedRequest).valid.query as PersonnelListQuery;

    const where: Prisma.UserWhereInput = { workspaceId: workspaceIdOf(req) };

    if (query.search) {
      const term = persianToEnglish(query.search);
      where.OR = [
        { fullName: { contains: term, mode: "insensitive" } },
        { username: { contains: term, mode: "insensitive" } },
        { phone: { contains: term, mode: "insensitive" } },
      ];
    }

    // The old handler ignored this parameter entirely, so getTechnicians() in
    // the frontend was receiving admins as well.
    if (query.role) {
      where.role = { name: query.role };
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: personnelSelect,
    });

    res.json(users.map(toPersonnelResponse));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/personnel/:id
export const getOne = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;

    // findFirst rather than findUnique: the id alone would resolve a user
    // belonging to another workspace.
    const user = await prisma.user.findFirst({
      where: { id, workspaceId: workspaceIdOf(req) },
      select: personnelSelect,
    });

    if (!user) {
      return res.status(404).json({ error: "پرسنل یافت نشد" });
    }

    res.json(toPersonnelResponse(user));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// POST /api/personnel
export const create = async (req: Request, res: Response) => {
  try {
    const body = (req as ValidatedRequest).valid.body as PersonnelCreateBody;
    const actor = (req as AuthenticatedRequest).user;

    const role = await prisma.role.findUnique({
      where: { id: body.role_id },
      select: { name: true },
    });
    if (!role) {
      return res.status(400).json({ error: "نقش انتخاب‌شده معتبر نیست" });
    }

    const refusal = roleRestriction(
      actor?.role,
      role.name,
      "ادمین فقط می‌تواند تکنسین ایجاد کند",
    );
    if (refusal) {
      return res.status(403).json({ error: refusal });
    }

    const duplicate = await prisma.user.findUnique({
      where: { username: body.username },
      select: { id: true },
    });
    if (duplicate) {
      return res
        .status(409)
        .json({ error: "این نام کاربری قبلاً ثبت شده است" });
    }

    const user = await prisma.user.create({
      data: {
        workspaceId: workspaceIdOf(req),
        fullName: body.full_name,
        username: body.username,
        password: await bcrypt.hash(body.password, 10),
        phone: body.phone,
        roleId: body.role_id,
      },
      select: personnelSelect,
    });

    res.status(201).json(toPersonnelResponse(user));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// PUT /api/personnel/:id
export const update = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id } = valid.params as IdParam;
    const body = valid.body as PersonnelUpdateBody;
    const actor = (req as AuthenticatedRequest).user;

    const existing = await prisma.user.findFirst({
      where: { id, workspaceId: workspaceIdOf(req) },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "پرسنل یافت نشد" });
    }

    // Changing your own role is a one-way door: a super admin who demotes
    // themselves has no way back, and in a workspace with a single super
    // admin it locks the account out of its own settings.
    if (body.role_id !== undefined && id === actor?.id) {
      return res
        .status(400)
        .json({ error: "نمی‌توانید نقش حساب خود را تغییر دهید" });
    }

    if (body.username) {
      const duplicate = await prisma.user.findFirst({
        where: { username: body.username, id: { not: id } },
        select: { id: true },
      });
      if (duplicate) {
        return res
          .status(409)
          .json({ error: "این نام کاربری قبلاً ثبت شده است" });
      }
    }

    if (body.role_id !== undefined) {
      const role = await prisma.role.findUnique({
        where: { id: body.role_id },
        select: { name: true },
      });
      if (!role) {
        return res.status(400).json({ error: "نقش انتخاب‌شده معتبر نیست" });
      }

      const refusal = roleRestriction(
        actor?.role,
        role.name,
        "ادمین فقط می‌تواند نقش تکنسین را تخصیص دهد",
      );
      if (refusal) {
        return res.status(403).json({ error: refusal });
      }
    }

    // Built key by key so an absent field keeps its current value.
    const data: Prisma.UserUpdateInput = {};
    if (body.full_name !== undefined) data.fullName = body.full_name;
    if (body.username !== undefined) data.username = body.username;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.role_id !== undefined) {
      data.role = { connect: { id: body.role_id } };
    }
    if (body.password !== undefined) {
      data.password = await bcrypt.hash(body.password, 10);
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: personnelSelect,
    });

    res.json(toPersonnelResponse(user));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// PUT /api/personnel/:id/toggle-active
export const toggleActive = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;
    const actor = (req as AuthenticatedRequest).user;

    if (id === actor?.id) {
      return res
        .status(400)
        .json({ error: "نمی‌توانید حساب خود را غیرفعال کنید" });
    }

    const target = await prisma.user.findFirst({
      where: { id, workspaceId: workspaceIdOf(req) },
      select: { isActive: true, role: { select: { name: true } } },
    });
    if (!target) {
      return res.status(404).json({ error: "پرسنل یافت نشد" });
    }

    if (actor?.role === "admin" && target.role.name === "super_admin") {
      return res
        .status(403)
        .json({ error: "ادمین نمی‌تواند سوپر ادمین را غیرفعال کند" });
    }

    const isActive = !target.isActive;

    await prisma.user.update({ where: { id }, data: { isActive } });

    res.json({
      message: isActive ? "حساب فعال شد" : "حساب غیرفعال شد",
      is_active: isActive,
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// DELETE /api/personnel/:id
export const remove = async (req: Request, res: Response) => {
  try {
    const { id } = (req as ValidatedRequest).valid.params as IdParam;
    const actor = (req as AuthenticatedRequest).user;

    if (id === actor?.id) {
      return res.status(400).json({ error: "نمی‌توانید حساب خود را حذف کنید" });
    }

    const existing = await prisma.user.findFirst({
      where: { id, workspaceId: workspaceIdOf(req) },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "پرسنل یافت نشد" });
    }

    // The schema detaches this user from devices, invoices and transactions
    // via onDelete: SetNull, and removes their device assignments via
    // Cascade — none of that has to be done by hand here.
    await prisma.user.delete({ where: { id } });

    res.json({ message: "پرسنل با موفقیت حذف شد" });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};
