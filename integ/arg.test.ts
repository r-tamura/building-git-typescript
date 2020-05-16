import * as arg from "arg";
import * as assert from "power-assert";

describe("arg", () => {
  it.each([
    ["parse 1 argument", {}, ["myarg"], { _: ["myarg"] }],
    [
      "parse boolean option",
      { "--required": Boolean },
      ["--required"],
      { "--required": true, _: [] },
    ],
    [
      "parse an option via alias",
      { "--required": Boolean, "-r": "--required" },
      ["-r"],
      { "--required": true, _: [] },
    ],
    [
      "parse an option with value",
      { "--count": Number },
      ["--count", "5"],
      { "--count": 5, _: [] },
    ],
    [
      "combined shorthand option",
      {
        "--force": Boolean,
        "--delete": Boolean,
        "-f": "--force",
        "-d": "--delete",
      },
      ["-fd"],
      { "--delete": true, "--force": true, _: [] },
    ],
    [
      "handler",
      {
        "--porcelain": arg.flag((...args: any[]) => {
          return false;
        }),
      },
      ["--porcelain"],
      { _: [], "--porcelain": false },
    ],
  ])("%s", (_title, spec, args, expected) => {
    const actual = arg(spec, { argv: args });
    assert.deepEqual(actual, expected);
  });
});
