const unitConfig = require("./jest.config");

module.exports = {
  ...unitConfig,
  roots: ["<rootDir>/test"],
  moduleNameMapper: {
    "~/(.*)": "<rootDir>/src/$1",
  },
};
