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
  type a = jest.ProvidesCallback;
  describe("index/workspace changes", () => {
    beforeEach(async () => {
      await t.writeFile("1.txt", "one");
      await t.writeFile("a/2.txt", "two");
      await t.writeFile("a/b/3.txt", "three");

      await t.jitCmd("add", ".");
      await t.commit("commit message");
    });

    it("prints nothing when no files are changed", async () => {
      await assertStatus("");
    });

    it("reports files with modified contents", async () => {
      // Arrange
      await t.writeFile("1.txt", "changed");
      await t.writeFile("a/2.txt", "modified");

      // Act & Assert
      await assertStatus([" M 1.txt", " M a/2.txt"].join("\n"));
    });

    it("reports files with change modes", async () => {
      // Arrange
      await t.makeExecutable("a/2.txt");

      // Act & Assert
      await assertStatus(" M a/2.txt");
    });

    it("reports modified files with unchanged size", async () => {
      await t.delay(1000); // Note: nano秒をtimestampで比較しないため, timestampを変えるために少し待つ
      await t.writeFile("a/b/3.txt", "hello");

      await assertStatus(" M a/b/3.txt");
    });

    it("prints nothing if a file is touched", async () => {
      await t.delay(1000);
      await t.touch("1.txt");

      await assertStatus("");
    });

    it("reports deleted files", async () => {
      await t.rm("a/2.txt");

      await assertStatus(" D a/2.txt");
    });

    it("reports files in deleted directories", async () => {
      await t.rm("a");

      await assertStatus([" D a/2.txt", " D a/b/3.txt"].join("\n"));
    });
  });

  describe("head/index changes", () => {
    beforeEach(async () => {
      await t.writeFile("1.txt", "one");
      await t.writeFile("a/2.txt", "two");
      await t.writeFile("a/b/3.txt", "three");

      await t.jitCmd("add", ".");
      await t.commit("first commit");
    });

    it("reports a file added to a tracked directory", async () => {
      await t.writeFile("a/4.txt", "four");
      await t.jitCmd("add", ".");

      await assertStatus("A  a/4.txt");
    });

    it("reports a file added to an untracked directory", async () => {
      await t.writeFile("d/e/5.txt", "five");
      await t.jitCmd("add", ".");

      await assertStatus("A  d/e/5.txt");
    });

    it("reports modified modes", async () => {
      await t.makeExecutable("1.txt");
      await t.jitCmd("add", ".");

      await assertStatus("M  1.txt");
    });

    it("reports modified content", async () => {
      await t.writeFile("a/b/3.txt", "changed");
      await t.jitCmd("add", ".");

      await assertStatus("M  a/b/3.txt");
    });
  });
});
