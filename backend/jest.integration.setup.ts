import "dotenv/config";

// Provider configuration that every import-time check needs, shared with
// jest.setup.ts so the two cannot drift. After dotenv, so a real value from
// a developer's .env still wins — everything in there uses `??=`.
//
// This import is what 12.5 established the need for: three template ids were
// added to the unit setup and not here, and every suite in this directory
// died at import with an error naming an SMS variable. The comment that used
// to sit below, saying to remember the other file, had already failed once
// for the same reason.
import "./src/__tests__/providerEnv";

const appUrl = process.env.TEST_DATABASE_URL_APP;
const ownerUrl = process.env.TEST_DATABASE_URL;

if (!appUrl || !ownerUrl) {
  throw new Error(
    "TEST_DATABASE_URL and TEST_DATABASE_URL_APP must both be set — see " +
      "backend/.env.example.",
  );
}

// Assigned rather than defaulted: dotenv has already loaded the development
// values from .env, and these have to win.
process.env.DATABASE_URL_APP = appUrl;
process.env.DATABASE_URL = ownerUrl;

// A test that trips the rate limiter would fail for a reason that has
// nothing to do with what it was checking.
process.env.RATE_LIMIT_API = "0";
process.env.RATE_LIMIT_LOGIN = "0";

// Signed tokens are minted by the fixtures, so the secret only has to be
// stable within a run.
process.env.JWT_SECRET ??= "integration-test-secret";
