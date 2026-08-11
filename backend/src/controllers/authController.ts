import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import prisma, { runInNewWorkspaceTransaction } from "../lib/prisma";
import type { Prisma } from "../generated/prisma/client";
import { JWT_SECRET } from "../middleware/auth";
import { ValidatedRequest } from "../middleware/validate";
import { AuthenticatedRequest } from "../types/request";
import { errorMessage, isUniqueConstraintError } from "../utils/errors";
import { populateWorkspace } from "../utils/newWorkspace";
import { setContextWorkspaceId } from "../lib/workspaceContext";
import type {
  ChangePasswordBody,
  LoginBody,
  RegisterBody,
} from "../schemas/auth";

// Includes the password hash because login has to compare against it. Every
// response goes through toUserResponse, which drops it again.
const userWithRole = {
  role: { select: { name: true, label: true } },
} satisfies Prisma.UserInclude;

type UserWithRole = Prisma.UserGetPayload<{ include: typeof userWithRole }>;

/**
 * What app_login_lookup() returns: only the columns password verification
 * needs. The full user is read through the normal client afterwards, once
 * the workspace is known and the RLS policies apply again.
 */
interface LoginCandidate {
  id: number;
  workspace_id: number;
  password: string;
  is_active: boolean;
}

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

/**
 * Token shape gains workspaceId here rather than in phase 3's later tasks:
 * every tenant-scoped query needs it, and reading it from the database on
 * each request is exactly the round-trip the design set out to avoid.
 */
function issueToken(user: UserWithRole): string {
  return jwt.sign(
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
}

// POST /api/auth/register
export const register = async (req: Request, res: Response) => {
  try {
    const body = (req as ValidatedRequest).valid.body as RegisterBody;

    // The workspace comes from app_create_workspace, which the helper calls:
    // the application role has no INSERT on workspaces, because creating a
    // tenant is not an ordinary request. Everything inside the callback is
    // ordinary tenant data and is written under the policies.
    const owner = await runInNewWorkspaceTransaction(
      body.workspace_name,
      (tx, workspaceId) =>
        populateWorkspace(tx, workspaceId, {
          workspaceName: body.workspace_name,
          username: body.username,
          password: body.password,
        }),
    );

    // Signed in straight away rather than bounced to the login form: the
    // credentials were just proven by having been chosen.
    res.status(201).json({
      token: issueToken(owner),
      user: toUserResponse(owner),
    });
  } catch (error) {
    // Username is unique platform-wide, so this is a real person being told
    // something true — not a leak. The number is their own.
    if (isUniqueConstraintError(error)) {
      return res
        .status(409)
        .json({ error: "این شماره موبایل قبلاً ثبت شده است" });
    }

    console.error("register error:", error);
    res.status(500).json({ error: errorMessage(error) });
  }
};

// POST /api/auth/login
export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = (req as ValidatedRequest).valid
      .body as LoginBody;

    // Goes through app_login_lookup rather than the client: at this point no
    // workspace is known, so an ordinary query would be filtered to nothing
    // by RLS and every login would read as a wrong password.
    const [candidate] = await prisma.$queryRaw<LoginCandidate[]>`
      SELECT * FROM app_login_lookup(${username})
    `;

    // Same message whether the username is unknown or the password is wrong,
    // so the response doesn't reveal which usernames exist.
    const invalidCredentials = { error: "نام کاربری یا رمز عبور اشتباه است" };

    if (!candidate) {
      return res.status(401).json(invalidCredentials);
    }

    const matches = await bcrypt.compare(password, candidate.password);
    if (!matches) {
      return res.status(401).json(invalidCredentials);
    }

    if (!candidate.is_active) {
      return res.status(403).json({ error: "حساب کاربری غیرفعال است" });
    }

    // Credentials are proven, so the caller's workspace is established and
    // the rest of this request runs under it like any other. Set here rather
    // than in authenticate(), which hasn't run and won't for this endpoint.
    setContextWorkspaceId(candidate.workspace_id);

    // findUniqueOrThrow rather than findUnique: the row was just read by
    // app_login_lookup, so its absence now would mean it vanished mid-request
    // — an unexpected state, not a login failure to report as one.
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: candidate.id },
      include: userWithRole,
    });

    // Token shape gains workspaceId here rather than in phase 3: every
    // tenant-scoped query needs it, and reading it from the database on each
    // request is exactly the round-trip the design set out to avoid.
    const token = issueToken(user);

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

    // No workspace in the filter: authenticate() has already put the caller's
    // workspace into the request context, so RLS scopes this lookup to it.
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
