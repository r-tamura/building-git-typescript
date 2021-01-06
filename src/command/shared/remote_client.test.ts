import * as assert from "power-assert";
import { buildAgentCommand } from "./remote_client";

describe("buildAgentCommand", () => {
  it.each`
    name          | url                                      | expected
    ${"basic"}    | ${"ssh://github.com/test/test.git"}      | ${["ssh", "github.com", "git-upload-pack /test/test.git"]}
    ${"username"} | ${"ssh://git@github.com/test/test.git"}  | ${["ssh", "github.com", "-l", "git", "git-upload-pack /test/test.git"]}
    ${"port"}     | ${"ssh://github.com:2222/test/test.git"} | ${["ssh", "github.com", "-p", "2222", "git-upload-pack /test/test.git"]}
  `("creates a command using ssh protocol ($name)", ({ url, expected }) => {
    const actual = buildAgentCommand("git-upload-pack", url);
    assert.deepEqual(actual, expected);
  });
});
