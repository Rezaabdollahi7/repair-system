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

// Every module that throws at import time needs a value here as well as in
// jest.setup.ts — there are two setup files, and only the unit one was kept
// up to date when lib/sms and lib/zibal grew their requirements. What kept
// this suite passing was dotenv finding them in a developer's .env, which is
// precisely the arrangement that breaks on a fresh checkout or in CI (7.7).
process.env.SMS_API_KEY ??= "test-key";
process.env.SMS_TEMPLATE_ID ??= "123456";

// The five subscription templates (8.7). lib/sms resolves every id at
// import, and app.ts reaches it through the auth routes — so a missing one
// takes down every suite here, with an error naming an SMS variable in a
// file about invoice numbering.
process.env.SMS_TEMPLATE_BEFORE_EXPIRY ??= "398956";
process.env.SMS_TEMPLATE_ON_EXPIRY ??= "764207";
process.env.SMS_TEMPLATE_AFTER_EXPIRY ??= "450597";
process.env.SMS_TEMPLATE_PAYMENT_OK ??= "344895";
process.env.SMS_TEMPLATE_REFERRAL_REWARD ??= "549585";

process.env.ZIBAL_MERCHANT ??= "test-merchant";
process.env.APP_URL ??= "http://localhost:5173";
