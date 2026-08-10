import "dotenv/config";
import { execSync } from "node:child_process";

/**
 * Brings the test database up to the current schema before any suite runs.
 *
 * migrate deploy rather than migrate dev: it only applies what already
 * exists, never prompts, and never invents a migration from schema drift.
 */
export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL;

  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Integration tests need their own " +
        "database — see backend/.env.example.",
    );
  }

  // A guard, not a formality: this function runs migrations and the suites
  // truncate tables. Pointed at the development database by a careless copy
  // and paste, it would wipe it.
  if (!/_test(\?|$)/.test(url)) {
    throw new Error(
      `Refusing to run integration tests against "${url}" — the database ` +
        "name must end in _test.",
    );
  }

  execSync("pnpm exec prisma migrate deploy", {
    // The owner connection: migrations create tables and roles, which the
    // unprivileged application role deliberately cannot do.
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
