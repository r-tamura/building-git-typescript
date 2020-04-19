const unitConfig = require("./jest.config");

module.exports = {
  ...unitConfig,
  roots: ["<rootDir>/integ"],
  moduleNameMapper: {
    "~/(.*)": "<rootDir>/src/$1",
  },
};
