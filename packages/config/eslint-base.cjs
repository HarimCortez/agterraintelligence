/**
 * Shared ESLint base config for the AgTerra Intelligence monorepo.
 * Consumed by apps/packages via `extends: ["@agterra/config/eslint-base.cjs"]`.
 */
module.exports = {
  root: false,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    sourceType: "module",
    ecmaVersion: "latest",
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: [
    "dist",
    ".next",
    ".turbo",
    "node_modules",
    "*.config.js",
    "*.config.cjs",
    "*.config.mjs",
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-explicit-any": "warn",
  },
};
