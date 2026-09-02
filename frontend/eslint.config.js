import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";

// Shared by both blocks on purpose: a file must not quietly slip out from
// under the hook rules the moment it is renamed from .jsx to .tsx.
const sharedRules = {
  "react-hooks/set-state-in-effect": "warn",
  "react-hooks/static-components": "warn",
  "react-hooks/immutability": "warn",
  "react-hooks/rules-of-hooks": "warn",
  "react-refresh/only-export-components": "warn",
};

export default defineConfig([
  globalIgnores(["dist", "node_modules"]),
  {
    files: ["**/*.{js,jsx}"],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      // Must stay last so it can disable stylistic rules from the configs above.
      prettier,
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    rules: {
      // Pre-existing violations across ~35 files, not touched here (out of
      // scope for a config-only task, and most are due for a Phase 1+
      // cleanup pass). Kept visible as warnings rather than silenced.
      "no-unused-vars": ["warn", { varsIgnorePattern: "^[A-Z_]" }],
      ...sharedRules,
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      // Must stay last so it can disable stylistic rules from the configs above.
      prettier,
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    rules: {
      // The base rule cannot see type-only imports or enum members; its
      // TypeScript counterpart replaces it rather than joining it.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^_" },
      ],
      // `strict: true` is only worth having if the escape hatch is closed.
      // A file that reaches for `any` under deadline never gets revisited.
      "@typescript-eslint/no-explicit-any": "error",
      ...sharedRules,
    },
  },
]);
