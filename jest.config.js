module.exports = {
  roots: ["<rootDir>/src", "<rootDir>/integ"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
};
