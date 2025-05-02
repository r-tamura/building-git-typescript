/**
 * eslint-config-prettier,eslint-plugin-pretterでprettierと重複する設定を無効に
 * @typescript-eslint-plugin/@typescript-eslint/parserでTypeScript対応した設定
 */
module.exports = {
  env: {
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
    "prettier/@typescript-eslint",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    // Note: ?
    sourceType: "module",
    // @typescript-eslint/no-floating-promises が型情報を必要とするため指定
    project: "./tsconfig.json",
  },
  plugins: ["@typescript-eslint"],
  rules: {
    "@typescript-eslint/no-floating-promises": 2,
    "@typescript-eslint/explicit-module-boundary-types": 0,
    "no-console": ["warn", { allow: ["warn", "error"] }],
  },
};
