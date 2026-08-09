// Pins the rate limits for the test run, independent of whatever is in a
// developer's .env — which may disable them entirely while testing by hand.
// dotenv doesn't overwrite variables that are already set, so these win.
process.env.RATE_LIMIT_API = "1000";
process.env.RATE_LIMIT_LOGIN = "10";
