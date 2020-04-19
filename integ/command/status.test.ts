import * as t from "./helper";
import { stripIndent } from "~/util";

describe("Command.Status", () => {
  async function assertStatus(expected: string) {
    await t.jitCmd("status");
    t.assertInfo(expected);
  }

  beforeEach(t.beforeHook);
  afterEach(t.afterHook);

  it("lists untracked files in name order", async () => {
    // Arrange
    await t.writeFile("file.txt", "");
    await t.writeFile("another.txt", "");

    // Act & Assert
    await assertStatus(stripIndent`
    ?? another.txt
    ?? file.txt
    `);
  });

  it("lists files as untracked if they are not in the index", async () => {
    // Arrange
    await t.writeFile("committed.txt", "");
    await t.jitCmd("add", ".");

    await t.commit("commit message");

    await t.writeFile("file.txt", "");

    // Act & Assert
    await assertStatus(stripIndent`
    ?? file.txt
    `);
  });

  it("lists untracked directories, not their contents", async () => {
    // Arrange
    await t.writeFile("file.txt", "");
    await t.writeFile("dir/another.txt", "");

    // Act & Assert
    await assertStatus(stripIndent`
    ?? dir/
    ?? file.txt
    `);
  });

  it("lists untracked files inside tracked directories", async () => {
    // Arrange
    await t.writeFile("a/b/inner.txt", "");
    await t.jitCmd("add", ".");
    await t.commit("commit message");

    await t.writeFile("a/outer.txt", "");
    await t.writeFile("a/b/c/file.txt", "");

    // Act & Assert
    await assertStatus(stripIndent`
    ?? a/b/c/
    ?? a/outer.txt
    `);
  });

  it("does not list empty untracked directories", async () => {
    // Arrange
    await t.mkdir("outer");

    // Act & Assert
    await assertStatus("");
  });

  it("lists untracked directories that indirectly contain files", async () => {
    await t.writeFile("outer/inner/file.txt", "");

    await assertStatus(stripIndent`
    ?? outer/
    `);
  });
});
