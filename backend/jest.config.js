/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  clearMocks: true,
  // The health check boots the real sql.js layer (wasm load + idempotent
  // ALTER TABLE migrations), which can exceed the 5s default on a cold run.
  // Drops back down once phase 1 moves this to Prisma.
  testTimeout: 20000,
};
