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
  it("HEADから新しいブランチを作る", async () => {
    // Act
    await t.jitCmd("branch", "master");

    // Assert
    assert.equal(
      await t.repo().refs.readRef("master"),
      await t.repo().refs.readHead()
    );
  });

  it("特定のコミットから新しいブランチを作る", async () => {
    // Arrange
    await t.writeFile("hello.txt", "changed");
    await t.commit("second commit");

    // Act
    await t.jitCmd("branch", "topic", "HEAD^");

    // Assert
    assert.equal(
      "8b86eb4ae21c63c6b983509337e797cab17ec6ad",
      await t.repo().refs.readRef("topic")
    );
  });
});
