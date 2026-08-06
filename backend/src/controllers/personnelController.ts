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

// Never selects the password column, so a hash can't leak into a response by
// accident the way `SELECT *` would allow.
const personnelSelect = {
  id: true,
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

// GET /api/personnel
export const getAll = async (req: Request, res: Response) => {
  try {
    const query = (req as ValidatedRequest).valid.query as PersonnelListQuery;

    const where: Prisma.UserWhereInput = {};

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

    const user = await prisma.user.findUnique({
      where: { id },
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

    const existing = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "پرسنل یافت نشد" });
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

    const target = await prisma.user.findUnique({
      where: { id },
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

    const existing = await prisma.user.findUnique({
      where: { id },
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
