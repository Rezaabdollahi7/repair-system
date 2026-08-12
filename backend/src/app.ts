import express, { Request, Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
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
    // /uploads serves device/settings images that the frontend <img> tags
    // load directly. Helmet's default Cross-Origin-Resource-Policy
    // ("same-origin") blocks that if the frontend is ever served from a
    // different origin/CDN than the API. Revisit once object storage
    // (roadmap phase 4) replaces local /uploads entirely.
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
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// General ceiling for the whole API — generous enough that a normal SPA
// session (dashboard load, list pagination, etc.) never gets near it. This
// is a basic/untuned config per roadmap 0.4; revisit limits once real
// traffic patterns are known.
const apiLimitMax = Number(process.env.RATE_LIMIT_API ?? 1000);
const loginLimitMax = Number(process.env.RATE_LIMIT_LOGIN ?? 10);

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

app.use("/api/auth/login", loginLimiter);
// Sign-up gets the same tight limit: until SMS verification exists (8.6),
// nothing else stands between an open endpoint and unlimited tenants.
app.use("/api/auth/register", loginLimiter);
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
