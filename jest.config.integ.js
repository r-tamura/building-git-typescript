const baseConfig = require("./jest.config");

module.exports = {
  ...baseConfig,
  roots: ["<rootDir>/integ"],
};
