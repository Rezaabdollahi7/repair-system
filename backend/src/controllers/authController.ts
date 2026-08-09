import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma";
import type { Prisma } from "../generated/prisma/client";
import { JWT_SECRET } from "../middleware/auth";
import { ValidatedRequest } from "../middleware/validate";
import { AuthenticatedRequest } from "../types/request";
import { errorMessage } from "../utils/errors";
import type { ChangePasswordBody, LoginBody } from "../schemas/auth";

// Includes the password hash because login has to compare against it. Every
// response goes through toUserResponse, which drops it again.
const userWithRole = {
  role: { select: { name: true, label: true } },
} satisfies Prisma.UserInclude;

type UserWithRole = Prisma.UserGetPayload<{ include: typeof userWithRole }>;

/**
 * The response shape the frontend already expects: the role relation is
 * flattened to `role` (its name) and `role_label`, and the password hash is
 * never included.
 */
function toUserResponse(user: UserWithRole) {
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
    role: user.role.name,
    role_label: user.role.label,
  };
}

// POST /api/auth/login
export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = (req as ValidatedRequest).valid
      .body as LoginBody;

    const user = await prisma.user.findUnique({
      where: { username },
      include: userWithRole,
    });

    // Same message whether the username is unknown or the password is wrong,
    // so the response doesn't reveal which usernames exist.
    const invalidCredentials = { error: "نام کاربری یا رمز عبور اشتباه است" };

    if (!user) {
      return res.status(401).json(invalidCredentials);
    }

    const matches = await bcrypt.compare(password, user.password);
    if (!matches) {
      return res.status(401).json(invalidCredentials);
    }

    if (!user.isActive) {
      return res.status(403).json({ error: "حساب کاربری غیرفعال است" });
    }

    // Token shape gains workspaceId here rather than in phase 3: every
    // tenant-scoped query needs it, and reading it from the database on each
    // request is exactly the round-trip the design set out to avoid.
    const token = jwt.sign(
      {
        id: user.id,
        workspaceId: user.workspaceId,
        username: user.username,
        role: user.role.name,
        isActive: user.isActive,
      },
      JWT_SECRET,
      { expiresIn: "72h" },
    );

    res.json({ token, user: toUserResponse(user) });
  } catch (error) {
    console.error("login error:", error);
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/auth/me
export const me = async (req: Request, res: Response) => {
  try {
    const actor = (req as AuthenticatedRequest).user;
    if (!actor) {
      return res.status(401).json({ error: "احراز هویت نشده" });
    }

    const user = await prisma.user.findUnique({
      where: { id: actor.id },
      include: userWithRole,
    });

    if (!user) {
      return res.status(404).json({ error: "کاربر یافت نشد" });
    }

    // Re-checked on every request rather than trusting the token: a token
    // issued before the account was disabled stays valid for up to 72 hours.
    if (!user.isActive) {
      return res.status(403).json({ error: "حساب کاربری غیرفعال است" });
    }

    res.json(toUserResponse(user));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// PUT /api/auth/change-password
export const changePassword = async (req: Request, res: Response) => {
  try {
    const actor = (req as AuthenticatedRequest).user;
    if (!actor) {
      return res.status(401).json({ error: "احراز هویت نشده" });
    }

    const { current_password, new_password } = (req as ValidatedRequest).valid
      .body as ChangePasswordBody;

    const user = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { password: true },
    });

    if (!user) {
      return res.status(404).json({ error: "کاربر یافت نشد" });
    }

    const matches = await bcrypt.compare(current_password, user.password);
    if (!matches) {
      return res.status(401).json({ error: "رمز فعلی اشتباه است" });
    }

    await prisma.user.update({
      where: { id: actor.id },
      data: { password: await bcrypt.hash(new_password, 10) },
    });

    res.json({ message: "رمز عبور با موفقیت تغییر کرد" });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};
