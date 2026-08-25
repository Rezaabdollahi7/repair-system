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
import { SmsError, SMS_STATUS, sendVerificationCode } from "../lib/sms";
import {
  OTP_SEND_LIMIT,
  OTP_SEND_WINDOW_MS,
  checkOtp,
  generateOtpCode,
  hashOtpCode,
  otpExpiry,
} from "../utils/otp";
import {
  ACCESS_TOKEN_TTL,
  REFRESH_COOKIE_NAME,
  generateRefreshToken,
  hashRefreshToken,
  refreshCookieOptions,
  refreshTokenExpiry,
} from "../utils/refreshToken";
import type {
  ChangePasswordBody,
  LoginBody,
  RegisterBody,
  SendOtpBody,
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
 * The short-lived half of the pair. Carries workspaceId so middleware can
 * authorize without a database round-trip — the reason it exists at all.
 */
function issueAccessToken(user: UserWithRole): string {
  return jwt.sign(
    {
      id: user.id,
      workspaceId: user.workspaceId,
      username: user.username,
      role: user.role.name,
      isActive: user.isActive,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL },
  );
}

/**
 * Starts a session: records a refresh token, hands it to the browser as an
 * httpOnly cookie, and returns the access token for the response body.
 *
 * The two halves are stored differently on purpose. The access token lives
 * in the page's memory, so it is gone on reload and never sits in
 * localStorage where injected script could read it. The refresh token is a
 * cookie the page cannot read at all, which is what makes a long-lived
 * credential tolerable.
 *
 * Requires a workspace context — the row it writes is tenant data like any
 * other.
 */
async function issueSession(
  res: Response,
  user: UserWithRole,
): Promise<string> {
  const token = generateRefreshToken();
  const expiresAt = refreshTokenExpiry();

  await prisma.refreshToken.create({
    data: {
      workspaceId: user.workspaceId,
      userId: user.id,
      // Only the hash: a leaked dump then holds nothing that can be replayed.
      tokenHash: hashRefreshToken(token),
      expiresAt,
    },
  });

  // The browser can walk away mid-request — React's development double-render
  // makes this routine on page load — and Express closes the response when it
  // does. Writing to a closed one throws ERR_HTTP_HEADERS_SENT, which then
  // surfaces as a 500 in the logs for something that was never a failure.
  //
  // The token row above is deliberately left in place: it costs nothing, and
  // the client that abandoned the request never received the token, so
  // nobody can present it.
  if (res.headersSent) {
    return issueAccessToken(user);
  }

  res.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions(expiresAt));
  return issueAccessToken(user);
}

/**
 * Thrown when the code was spent between the check and the transaction.
 * A distinct type rather than a flag, so the catch below can tell it from a
 * database failure and answer 400 instead of 500.
 */
class OtpAlreadyUsedError extends Error {
  constructor() {
    super("otp already used");
    this.name = "OtpAlreadyUsedError";
  }
}

// POST /api/auth/send-otp
export const sendOtp = async (req: Request, res: Response) => {
  try {
    const { phone, purpose } = (req as ValidatedRequest).valid
      .body as SendOtpBody;

    // Through app_login_lookup, the same aperture login uses: no workspace is
    // known here either. Only whether a row came back is used — the aperture
    // is not widened, and the four columns it already returns are enough.
    const [existing] = await prisma.$queryRaw<LoginCandidate[]>`
      SELECT * FROM app_login_lookup(${phone})
    `;

    // The two purposes have opposite preconditions, which is why `purpose` is
    // required rather than inferred.
    if (purpose === "register" && existing) {
      // Told plainly, not hidden: register already answers 409 for a taken
      // number, so concealing it here would protect nothing while letting
      // someone fill in the whole form and pay for a message before finding
      // out.
      return res
        .status(409)
        .json({ error: "این شماره موبایل قبلاً ثبت شده است" });
    }

    const sent = { message: "کد تأیید برای شما ارسال شد" };

    if (purpose === "reset" && !existing) {
      // Success, and no message. Not for privacy — the register path above
      // reveals the same fact — but for cost: without this, the endpoint is a
      // way to send SMS to any number in the country at our expense.
      return res.json(sent);
    }

    const windowStart = new Date(Date.now() - OTP_SEND_WINDOW_MS);

    // Counted on the phone number alone, across both purposes: what is being
    // rationed is messages to that handset, and it does not get a second
    // allowance by asking for the other kind of code.
    const recent = await prisma.otpCode.count({
      where: { phone, createdAt: { gt: windowStart } },
    });

    if (recent >= OTP_SEND_LIMIT) {
      return res.status(429).json({
        error: "تعداد درخواست کد بیش از حد مجاز است. یک ساعت دیگر تلاش کنید",
      });
    }

    // Housekeeping while we are here, like the refresh sweep — no cron for a
    // table this small. By created_at, NOT expires_at: a code dies after
    // three minutes but has to keep counting against the ceiling above for an
    // hour, and sweeping on expiry would quietly disable it while looking
    // like ordinary tidying.
    await prisma.otpCode.deleteMany({
      where: { createdAt: { lt: windowStart } },
    });

    // Asking again invalidates whatever came before, so only one code per
    // phone and purpose is ever live. Otherwise a code the user abandoned
    // stays usable for its full three minutes alongside the one they are
    // reading off their screen.
    await prisma.otpCode.updateMany({
      where: { phone, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const code = generateOtpCode();

    const record = await prisma.otpCode.create({
      data: {
        phone,
        purpose,
        codeHash: hashOtpCode(code),
        expiresAt: otpExpiry(),
      },
      select: { id: true },
    });

    try {
      await sendVerificationCode(phone, code);
    } catch (error) {
      // The row goes: no message was delivered, so it must not sit there
      // counting against an allowance the caller never spent. Deleted rather
      // than marked consumed, which would leave it in the hourly count.
      await prisma.otpCode.delete({ where: { id: record.id } });

      // The code is never logged, on this path or any other: three minutes is
      // long enough for anyone with log access to use it.
      console.error("send-otp failed:", errorMessage(error));

      if (
        error instanceof SmsError &&
        error.providerStatus === SMS_STATUS.BLACKLISTED
      ) {
        // The one provider failure the user can act on — every other status
        // is our credit, our key or our template, and telling a shop owner
        // about those only invites them to retry something that cannot work.
        return res.status(400).json({
          error: "ارسال پیامک به این شماره ممکن نیست. با پشتیبانی تماس بگیرید",
        });
      }

      return res
        .status(502)
        .json({ error: "ارسال پیامک ناموفق بود. دوباره تلاش کنید" });
    }

    // Nothing but the message. Not the expiry, which the form counts down on
    // its own, and not how much of the allowance is left — that would tell
    // whoever is probing exactly where the ceiling is.
    res.json(sent);
  } catch (error) {
    console.error("send-otp error:", errorMessage(error));
    res.status(500).json({ error: errorMessage(error) });
  }
};

// POST /api/auth/register
export const register = async (req: Request, res: Response) => {
  try {
    const body = (req as ValidatedRequest).valid.body as RegisterBody;

    // Newest first: re-sending marks the previous rows consumed, but reading
    // the newest anyway means a stale row can never be the one examined.
    const candidate = await prisma.otpCode.findFirst({
      where: { phone: body.username, purpose: "register" },
      orderBy: { id: "desc" },
      select: {
        id: true,
        codeHash: true,
        expiresAt: true,
        attempts: true,
        consumedAt: true,
      },
    });

    const verdict = checkOtp(candidate, body.code);

    // Counted here, outside the transaction below, and on purpose: an
    // increment inside it would be rolled back along with the failed sign-up,
    // and the ceiling would never be reached however many codes were tried.
    if (!verdict.ok && candidate) {
      await prisma.otpCode.update({
        where: { id: candidate.id },
        data: { attempts: { increment: 1 } },
      });
    }

    if (!verdict.ok) {
      // Burned is the one failure worth telling apart. The others — wrong,
      // expired, already used, no code at all — get one message, because
      // distinguishing them tells whoever is guessing which numbers have a
      // live code. Burned has to be said plainly or the user retypes the
      // correct code until it expires and never learns why it stopped working.
      return res.status(400).json({
        error:
          verdict.reason === "burned"
            ? "کد تأیید باطل شده است. کد جدید درخواست کنید"
            : "کد تأیید معتبر نیست",
      });
    }

    // The workspace comes from app_create_workspace, which the helper calls:
    // the application role has no INSERT on workspaces, because creating a
    // tenant is not an ordinary request. Everything inside the callback is
    // ordinary tenant data and is written under the policies.
    const owner = await runInNewWorkspaceTransaction(
      body.workspace_name,
      async (tx, workspaceId) => {
        // Spent inside the transaction so a sign-up that fails afterwards —
        // a number taken in the seconds since send-otp, most likely — leaves
        // the code usable rather than costing the caller one of three.
        //
        // Conditional on consumedAt still being null, so two requests racing
        // with the same code cannot both create a workspace: the second
        // updates nothing and is turned away.
        // Narrowed into a local because checkOtp's verdict says candidate is
        // non-null but its type does not, and TypeScript will not carry the
        // narrowing into the closure below in any case.
        const verified = candidate as NonNullable<typeof candidate>;
        const spent = await tx.otpCode.updateMany({
          where: { id: verified.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });

        if (spent.count === 0) {
          throw new OtpAlreadyUsedError();
        }

        return populateWorkspace(tx, workspaceId, {
          workspaceName: body.workspace_name,
          username: body.username,
          password: body.password,
        });
      },
    );

    // The helper set the workspace inside its transaction, which has now
    // closed; the async context never learned about it. Publishing it here
    // is what lets the refresh-token row below be written like ordinary
    // tenant data.
    setContextWorkspaceId(owner.workspaceId);

    // Signed in straight away rather than bounced to the login form: the
    // credentials were just proven by having been chosen.
    res.status(201).json({
      token: await issueSession(res, owner),
      user: toUserResponse(owner),
    });
  } catch (error) {
    if (error instanceof OtpAlreadyUsedError) {
      return res.status(400).json({ error: "کد تأیید معتبر نیست" });
    }

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

/** The shape app_refresh_lookup returns — snake_case, as SQL gives it. */
interface RefreshCandidate {
  id: number;
  user_id: number;
  workspace_id: number;
  expires_at: Date;
  revoked_at: Date | null;
}

/** Clears the cookie so a browser doesn't keep presenting a dead token. */
function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });
}

// POST /api/auth/refresh
export const refresh = async (req: Request, res: Response) => {
  try {
    const presented = req.cookies?.[REFRESH_COOKIE_NAME];

    // One message for every failure below: which of them happened is
    // information about somebody else's session.
    const invalid = { error: "نشست معتبر نیست. دوباره وارد شوید" };

    if (typeof presented !== "string" || presented.length === 0) {
      return res.status(401).json(invalid);
    }

    // Through app_refresh_lookup, not the client: this endpoint is reached
    // precisely when the access token has expired, so there is no workspace
    // context for a policy to match against.
    const [candidate] = await prisma.$queryRaw<RefreshCandidate[]>`
      SELECT * FROM app_refresh_lookup(${hashRefreshToken(presented)})
    `;

    if (!candidate) {
      clearRefreshCookie(res);
      return res.status(401).json(invalid);
    }

    // Everything from here is this workspace's own data.
    setContextWorkspaceId(candidate.workspace_id);

    // A revoked token presented again means a copy is in circulation: the
    // legitimate holder rotated it away, so whoever sent this one kept an
    // old copy. Which of the two is the thief is unknowable, so every
    // session that user has is ended and both are made to sign in again.
    if (candidate.revoked_at !== null) {
      await prisma.refreshToken.updateMany({
        where: { userId: candidate.user_id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      clearRefreshCookie(res);
      return res.status(401).json(invalid);
    }

    if (candidate.expires_at.getTime() <= Date.now()) {
      clearRefreshCookie(res);
      return res.status(401).json(invalid);
    }

    const user = await prisma.user.findUnique({
      where: { id: candidate.user_id },
      include: userWithRole,
    });

    // Re-checked rather than trusted: the account may have been disabled or
    // deleted since this token was issued.
    if (!user || !user.isActive) {
      clearRefreshCookie(res);
      return res.status(401).json(invalid);
    }

    // Rotation: this token is spent, and a replay of it is what triggers the
    // revocation above. Marked rather than deleted, or a stolen copy would
    // simply read as unknown.
    await prisma.refreshToken.update({
      where: { id: candidate.id },
      data: { revokedAt: new Date() },
    });

    // Housekeeping while we're already here: without it the table only ever
    // grows, and these rows can never be useful again.
    await prisma.refreshToken.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
    });

    // The user comes back too: it was already read above to check isActive,
    // and without it the client would have to call /auth/me right after every
    // refresh just to learn who it is.
    const token = await issueSession(res, user);

    if (!res.headersSent) {
      res.json({ token, user: toUserResponse(user) });
    }
  } catch (error) {
    console.error("refresh error:", error);

    // Guarded: a failure after the response went out cannot be reported to
    // the caller, and trying only replaces the real error in the log with a
    // second, misleading one.
    if (!res.headersSent) {
      res.status(500).json({ error: errorMessage(error) });
    }
  }
};

// POST /api/auth/logout
export const logout = async (req: Request, res: Response) => {
  try {
    const presented = req.cookies?.[REFRESH_COOKIE_NAME];

    if (typeof presented === "string" && presented.length > 0) {
      const [candidate] = await prisma.$queryRaw<RefreshCandidate[]>`
        SELECT * FROM app_refresh_lookup(${hashRefreshToken(presented)})
      `;

      if (candidate) {
        setContextWorkspaceId(candidate.workspace_id);

        // Deleted rather than marked revoked, unlike rotation. A revoked row
        // presented again is treated as a stolen copy and ends every session
        // that user has — which is right after a rotation, but wrong here: a
        // stale tab retrying after logout would sign the shop's desktop out
        // too. Ending your own session carries no signal, so it leaves
        // nothing behind to misread.
        await prisma.refreshToken.deleteMany({ where: { id: candidate.id } });
      }
    }

    // Always cleared and always 200: an unknown or already-dead token still
    // leaves the caller logged out, which is what they asked for.
    clearRefreshCookie(res);
    res.json({ message: "خروج انجام شد" });
  } catch (error) {
    console.error("logout error:", error);
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

    res.json({
      token: await issueSession(res, user),
      user: toUserResponse(user),
    });
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
