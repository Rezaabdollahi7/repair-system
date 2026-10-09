// Provider configuration that every import-time check needs, shared with
// jest.integration.setup.ts so the two cannot drift. Adding a template id or
// a new client's variables is one edit, there.
import "./src/__tests__/providerEnv";

// Pins the rate limits for the test run, independent of whatever is in a
// developer's .env — which may disable them entirely while testing by hand.
// dotenv doesn't overwrite variables that are already set, so these win.
process.env.RATE_LIMIT_API = "1000";
process.env.RATE_LIMIT_LOGIN = "10";
// Three is the real production value and the tests need to hit it, unlike
// the two above which are raised out of the way.
process.env.RATE_LIMIT_OTP = "3";

// The tests mock Prisma and never open a connection, but lib/prisma throws
// at import time without this.
process.env.DATABASE_URL_APP ??=
  "postgresql://dofixo_app:test@127.0.0.1:5432/dofixo_test?schema=public";

// middleware/auth throws at import time without one, and every suite that
// touches auth imports it. Deliberately not shared with the integration run:
// the two mint their own tokens and there is no reason for them to agree.
process.env.JWT_SECRET ??= "unit-test-secret";
