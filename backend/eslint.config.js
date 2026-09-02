const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const globals = require("globals");
const prettier = require("eslint-config-prettier");

module.exports = tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "backups/**",
      "src/uploads/**",
      // Prisma Client output. Generated from schema.prisma, gitignored, and
      // not ours to lint.
      "src/generated/**",
    ],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: globals.node,
    },
    extends: [js.configs.recommended],
    rules: {
      // Legacy sql.js code has empty/unused catches (e.g. idempotent
      // `ALTER TABLE ADD COLUMN`). These controllers get rewritten in
      // Phase 1 (Prisma migration) rather than fixed piecemeal now.
      "no-unused-vars": "warn",
      "no-empty": "warn",
    },
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: globals.node,
    },
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
  },
  {
    files: ["**/__tests__/**/*.ts", "**/*.test.ts"],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
  },
  prettier,
);
