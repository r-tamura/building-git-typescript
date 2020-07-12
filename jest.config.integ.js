const unitConfig = require("./jest.config");

module.exports = {
  ...unitConfig,
  roots: ["<rootDir>/integ"],
};
