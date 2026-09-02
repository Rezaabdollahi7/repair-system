import { NextFunction, Request, Response } from "express";

/**
 * The three roles, ordered. Internal: nothing outside this file has needed
 * the numbers, and exporting them would invite comparisons made by hand
 * somewhere the ordering could quietly disagree with this one.
 */
const ROLE_HIERARCHY = {
  super_admin: 3,
  admin: 2,
  technician: 1,
} as const;

type Role = keyof typeof ROLE_HIERARCHY;

/**
 * Shared by both guards below. Returns the response to send, or null when the
 * caller may proceed.
 *
 * isActive comes from the token, which now lives fifteen minutes rather than
 * seventy-two hours — so a disabled account loses access within that window
 * without any check here, and /auth/refresh re-reads it from the database
 * before issuing the next one. Kept as the cheap first line rather than the
 * only one.
 */
function rejectionFor(req: Request): { status: number; body: object } | null {
  if (!req.user) {
    return { status: 401, body: { error: "احراز هویت نشده" } };
  }

  if (!req.user.isActive) {
    return { status: 403, body: { error: "حساب کاربری غیرفعال است" } };
  }

  return null;
}

const FORBIDDEN = { error: "دسترسی ندارید" };

/**
 * Exactly one of the named roles. Use where seniority is beside the point and
 * a specific role is meant: `authorize("super_admin")` on deleting a user.
 */
export function authorize(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const rejection = rejectionFor(req);
    if (rejection) {
      res.status(rejection.status).json(rejection.body);
      return;
    }

    if (!allowedRoles.includes(req.user!.role as Role)) {
      res.status(403).json(FORBIDDEN);
      return;
    }

    next();
  };
}

/**
 * That role or more senior. `atLeast("admin")` admits admins and super
 * admins, so adding a role above admin later doesn't mean revisiting every
 * route that meant "an admin or better".
 */
export function atLeast(minRole: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const rejection = rejectionFor(req);
    if (rejection) {
      res.status(rejection.status).json(rejection.body);
      return;
    }

    // Falls back to 0 rather than throwing: role is a string column, so a
    // value outside the three is possible in principle, and the safe reading
    // of an unrecognised role is "no privileges".
    const userLevel = ROLE_HIERARCHY[req.user!.role as Role] ?? 0;

    if (userLevel < ROLE_HIERARCHY[minRole]) {
      res.status(403).json(FORBIDDEN);
      return;
    }

    next();
  };
}
