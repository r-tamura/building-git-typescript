import * as t from "./helper";
import * as assert from "power-assert";
import { promises } from "fs";
import * as path from "path";
const fs = promises;

describe("", () => {
  beforeEach(t.beforeHook);
  afterEach(t.afterHook);

  beforeEach(async () => {
    await t.writeFile("hello.txt", "hello");
    await t.jitCmd("add", ".");
    await t.commit("first commit");
  });
  it("新しいブランチを作る", async () => {
    // Arrange

    // Act
    await t.jitCmd("branch", "master");

    // Assert
    assert.equal(
      await fs.readFile(
        path.join(t.repoPath(), ".git/refs/heads/master"),
        "utf-8"
      ),
      (await t.repo().refs.readHead()) + "\n"
    );
  });
});
