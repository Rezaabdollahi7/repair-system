/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/integration/**/*.test.ts"],
  clearMocks: true,

  // Applies the migrations to the test database once, before any suite runs.
  globalSetup: "<rootDir>/jest.integration.globalSetup.ts",

  // Points DATABASE_URL_APP at the test database before lib/prisma is
  // imported — it reads the variable at module load and refuses to start
  // without it.
  setupFiles: ["<rootDir>/jest.integration.setup.ts"],

  // One worker: every suite shares one database, and parallel truncation
  // would have suites deleting each other's fixtures mid-assertion.
  maxWorkers: 1,

  // Real round trips to Postgres, not mocks.
  testTimeout: 30000,
};
