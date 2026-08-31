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
// Object storage is mocked in the unit tests, but lib/storage throws at
// import time without these.
process.env.S3_ENDPOINT ??= "https://s3.example.invalid";
process.env.S3_BUCKET ??= "dofixo-test";
process.env.S3_ACCESS_KEY ??= "test-key";
process.env.S3_SECRET_KEY ??= "test-secret";
// Same again for lib/sms. No suite imports it yet, so nothing fails today —
// but the moment authController does (OTP.3), every suite that mounts app.ts
// would die at import with an error naming an SMS variable, which reads as
// anything but the missing line here.
process.env.SMS_API_KEY ??= "test-key";
process.env.SMS_TEMPLATE_ID ??= "123456";

// lib/prisma and lib/sms already throw at import time without theirs;
// middleware/auth now does the same, and every suite that touches auth
// imports it.
process.env.JWT_SECRET ??= "unit-test-secret";

// lib/zibal throws at import time without both, and app.ts reaches it
// through the subscription routes — so every suite that mounts the app needs
// them. Passing today only because dotenv finds them in a developer's .env,
// which is exactly the arrangement that breaks on a fresh checkout or in CI.
process.env.ZIBAL_MERCHANT ??= "test-merchant";
process.env.APP_URL ??= "http://localhost:5173";
