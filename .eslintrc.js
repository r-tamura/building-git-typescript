/**
 * eslint-config-prettier,eslint-plugin-pretterでprettierと重複する設定を無効に
 * @typescript-eslint-plugin/@typescript-eslint/parserでTypeScript対応した設定
 */
module.exports = {
  env: {
    browser: true,
    es2020: true,
  },
  extends: ["prettier", "plugin:@typescript-eslint/recommended"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    // Note: ?
    ecmaVersion: 11,
    sourceType: "module",
    project: "./tsconfig.json",
  },
  plugins: ["@typescript-eslint"],
  rules: {
    quotes: [2, "double"],
    semi: [2, "always"],
    "comma-dangle": ["error", "only-multiline"],
    "@typescript-eslint/no-floating-promises": 2,
    "@typescript-eslint/explicit-module-boundary-types": 0,
  },
};
