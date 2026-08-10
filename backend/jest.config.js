/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  clearMocks: true,

  // Integration tests need a real database and their own config, so they are
  // excluded here rather than failing whenever one isn't running.
  testPathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/src/__tests__/integration/",
  ],

  // Runs before any module is imported, so app.ts sees these values when it
  // constructs its limiters at load time.
  setupFiles: ["<rootDir>/jest.setup.ts"],

  testTimeout: 20000,
};
