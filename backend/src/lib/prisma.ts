import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set — the API cannot start without it.");
}

// Prisma 7 no longer connects on its own: the client delegates to a driver
// adapter, which owns the actual pg connection pool.
const adapter = new PrismaPg({ connectionString });

// A single client for the whole process. Each instance carries its own pool,
// so constructing one per module would exhaust Postgres connections well
// before the ~500-workspace scale this is designed for.
const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

export default prisma;
