module.exports = {
  root: true,
  extends: [require.resolve("@agterra/config/eslint-base.cjs")],
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
  env: {
    node: true,
  },
  ignorePatterns: ["src/generated/**"],
};
