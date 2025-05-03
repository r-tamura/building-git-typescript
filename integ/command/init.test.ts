import * as fsCb from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as assert from "power-assert";
import * as T from "./helper";
const fs = fsCb.promises;

const t = T.create();

describe("init", () => {
  afterEach(t.afterHook);

  it("creates HEAD file", async () => {
    // Arrange
    await fs.mkdir(t.repoPath);

    // Act
    await t.kitCmd("init", t.repoPath);

    // Assert
    const gitPath = path.join(t.repoPath, ".git");
    assert.equal(
      await fs.readFile(path.join(gitPath, "HEAD"), "utf-8"),
      `ref: refs/heads/master${os.EOL}`,
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
