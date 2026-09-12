import { SMS_TEMPLATES } from "../lib/smsTemplateNames";

/**
 * Defaults for every module that reads its configuration at import time and
 * refuses to start without it: lib/prisma, lib/storage, lib/sms, lib/zibal
 * and middleware/auth.
 *
 * Imported by **both** jest.setup.ts and jest.integration.setup.ts, and that
 * is the whole point of the file. It lives under src/ rather than beside
 * them because tsconfig sets rootDir to src, and a file outside it that
 * imports from inside it is the kind of resolution question nobody should
 * have to answer while a test run is red.
 *
 * jest.config's testMatch only collects *.test.ts, so it is not picked up
 * as a suite — the same reason integration/helpers.ts can sit there. There are two setup files, they need the
 * same provider values, and keeping them in step by hand has failed twice:
 * once when lib/sms and lib/zibal grew their requirements and only the unit
 * file was updated, and again in 12.5 when three template ids were added to
 * the unit file and every integration suite died at import with an error
 * naming an SMS variable in a file about invoice numbering.
 *
 * A comment saying "remember the other file" was already there for the first
 * one. It did not work, so the duplication is gone instead.
 *
 * Everything here uses `??=` so a real value from a developer's .env wins —
 * which is why each setup file loads dotenv before importing this. What must
 * NOT be here is anything the two runs deliberately disagree about: the
 * database URLs, the rate limits, and the JWT secret all differ, and each
 * setup file keeps its own.
 */

// Object storage. Mocked in the tests, but lib/storage resolves these at
// import and throws without them.
process.env.S3_ENDPOINT ??= "https://s3.example.invalid";
process.env.S3_BUCKET ??= "dofixo-test";
process.env.S3_ACCESS_KEY ??= "test-key";
process.env.S3_SECRET_KEY ??= "test-secret";

// sms.ir. The key, plus the verification template used by sign-up.
process.env.SMS_API_KEY ??= "test-key";
process.env.SMS_TEMPLATE_ID ??= "123456";

/**
 * Every id in SMS_TEMPLATES, derived from the list rather than copied out of
 * it.
 *
 * lib/sms resolves all of them at import and app.ts reaches lib/sms through
 * the auth routes, so one missing name takes down every suite that mounts
 * the app — with an import-time throw naming an SMS variable in a suite
 * about invoice numbering. That has now happened twice from someone adding a
 * template and not a matching line here.
 *
 * The loop is what stops a third time: a template added to
 * lib/smsTemplateNames needs no edit in this file at all. Importing that
 * module rather than lib/sms is the whole point — lib/sms is the thing that
 * throws, so reading the list from it would trigger the failure this exists
 * to prevent.
 *
 * The ids are fake and only have to be integers; a test never reaches the
 * provider. Real values from a developer's .env still win, since each is set
 * with `??=`.
 */
for (const [index, name] of Object.values(SMS_TEMPLATES).entries()) {
  process.env[name] ??= String(100000 + index);
}

// Zibal. lib/zibal reads both at import, and APP_URL is what the two payment
// callbacks are built from.
process.env.ZIBAL_MERCHANT ??= "test-merchant";
process.env.APP_URL ??= "http://localhost:5173";
