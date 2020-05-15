import * as fsCb from "fs";
import * as path from "path";
import * as assert from "power-assert";
import * as t from "./helper";
const fs = fsCb.promises;

describe("init", () => {
  afterEach(t.afterHook);

  it("creates HEAD file", async () => {
    await fs.mkdir(t.repoPath());
    await t.jitCmd("init", t.repoPath());

    // Assert
    assert.equal(
      await fs.readFile(path.join(t.repoPath(), ".git", "HEAD"), "utf-8"),
      "ref: refs/heads/master\n"
    );
  });
});
