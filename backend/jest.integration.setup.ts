import "dotenv/config";

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

// Object storage is mocked in the unit tests, but lib/storage throws at
// import time without these.
process.env.S3_ENDPOINT ??= "https://s3.example.invalid";
process.env.S3_BUCKET ??= "dofixo-test";
process.env.S3_ACCESS_KEY ??= "test-key";
process.env.S3_SECRET_KEY ??= "test-secret";