// Pins the rate limits for the test run, independent of whatever is in a
// developer's .env — which may disable them entirely while testing by hand.
// dotenv doesn't overwrite variables that are already set, so these win.
process.env.RATE_LIMIT_API = "1000";
process.env.RATE_LIMIT_LOGIN = "10";
// The tests mock Prisma and never open a connection, but lib/prisma throws
// at import time without this.
process.env.DATABASE_URL_APP ??=
  "postgresql://dofixo_app:test@127.0.0.1:5432/dofixo_test?schema=public";
