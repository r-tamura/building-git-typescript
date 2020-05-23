import * as fsCb from "fs";
import * as path from "path";
import * as assert from "power-assert";
import * as T from "./helper";
const fs = fsCb.promises;

const t = T.create();

describe("init", () => {
  afterEach(t.afterHook);

  it("creates HEAD file", async () => {
    await fs.mkdir(t.repoPath);
    await t.kitCmd("init", t.repoPath);

    // Assert
    const gitPath = path.join(t.repoPath, ".git");
    assert.equal(
      await fs.readFile(path.join(gitPath, "HEAD"), "utf-8"),
      "ref: refs/heads/master\n",
      "HEADファイル作成"
    );

    assert.equal(
      await fs
        .stat(path.join(gitPath, "refs", "heads"))
        .then((stat) => stat.isDirectory()),
      true,
      ".git/refs/headsディレクトリの作成"
    );
  });
});
