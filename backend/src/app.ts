import express, { Request, Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import "dotenv/config";
import prisma from "./lib/prisma";
import routes from "./routes";
import { requestContext } from "./middleware/requestContext";

const app = express();

// Must be set before the rate limiters below are constructed: they read
// req.ip, which Express only derives from X-Forwarded-For when trust proxy
// is enabled. TRUST_PROXY=1 in production (behind Nginx/Caddy) so each real
// client gets its own bucket; TRUST_PROXY=0 in local dev, where there's no
// proxy and trusting the header would let a client spoof its own IP.
app.set("trust proxy", process.env.TRUST_PROXY === "1");

app.use(
  helmet({
    // Still relaxed, though no longer for /uploads: the SPA and the API are
    // separate origins in development (5173 and 5001), and the default
    // "same-origin" policy stops the browser using the response at all.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());
// The refresh token arrives as an httpOnly cookie rather than in the body,
// so it cannot be read by script that has got onto the page.
app.use(cookieParser());

// Ahead of every router: authenticate() writes the caller's workspace into
// the context this opens, and the Prisma extension reads it from there.
app.use(requestContext);

// General ceiling for the whole API — generous enough that a normal SPA
// session (dashboard load, list pagination, etc.) never gets near it. This
// is a basic/untuned config per roadmap 0.4; revisit limits once real
// traffic patterns are known.
const apiLimitMax = Number(process.env.RATE_LIMIT_API ?? 1000);
const loginLimitMax = Number(process.env.RATE_LIMIT_LOGIN ?? 10);
// Deliberately three per hour rather than per fifteen minutes: this is the
// same ceiling the otp_codes table enforces per phone number, and two limits
// on the same action disagreeing about their window is a support call nobody
// can answer.
const otpLimitMax = Number(process.env.RATE_LIMIT_OTP ?? 3);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: apiLimitMax,
  skip: () => apiLimitMax === 0,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تعداد درخواست‌ها بیش از حد مجاز است" },
});

// Tighter limiter specifically for login, since brute-forcing a password is
// the most realistic attack surface until SMS OTP (roadmap phase 8) exists.
// Keyed by IP (the default) since there's no authenticated user yet at this
// endpoint.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: loginLimitMax,
  skip: () => loginLimitMax === 0,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "تلاش‌های ورود بیش از حد مجاز است. بعداً دوباره تلاش کنید",
  },
});

/**
 * A separate bucket from login, not the same limiter reused.
 *
 * Every message costs money, so this is the one endpoint where the limit
 * protects a bank balance rather than a password. Sharing login's bucket
 * would also mean ten bad password attempts locked a stranger out of signing
 * up from the same café wifi.
 *
 * This is the IP half only. The phone-number half lives in otp_codes, and
 * both are needed: an IP limit alone lets a botnet spend the SMS account,
 * and a phone limit alone lets one host walk through a list of numbers.
 */
const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: otpLimitMax,
  skip: () => otpLimitMax === 0,
  // Only successful sends count. A failure means no message left the
  // building — the row is deleted for exactly that reason — and charging the
  // caller for one costs them an hour over an outage they had no part in.
  // The phone-number ceiling in otp_codes already works this way.
  skipFailedRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "تعداد درخواست کد بیش از حد مجاز است. بعداً دوباره تلاش کنید",
  },
});

app.use("/api/auth/login", loginLimiter);
// Sign-up keeps the tight limit even now that OTP.4 puts a verified code in
// front of it: the code is the identity check, this is the volume one.
app.use("/api/auth/register", loginLimiter);
app.use("/api/auth/send-otp", otpLimiter);
// Login's bucket, not the OTP one: this endpoint spends no money, and
// guessing a code here is the same shape of attack as guessing a password.
// The three-attempt ceiling on the row is the real guard; this is the
// volume one.
app.use("/api/auth/reset-password", loginLimiter);
app.use("/api", apiLimiter);
app.use("/api", routes);

app.get("/api/health", async (req: Request, res: Response) => {
  try {
    // A real round trip rather than just reporting the process is alive:
    // until now this checked the sql.js file, so it answered "connected"
    // while saying nothing at all about Postgres.
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "OK", message: "Server is running", db: "connected" });
  } catch {
    res.status(503).json({
      status: "ERROR",
      message: "Server is running",
      db: "disconnected",
    });
  }
});

export default app;
