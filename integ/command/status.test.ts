import * as t from "./helper";
import { stripIndent } from "~/util";

describe("Command.Status", () => {
  async function assertStatus(expected: string) {
    await t.jitCmd("status");
    t.assertInfo(expected);
  }

  async function assertStatusPorcelain(expected: string) {
    await t.jitCmd("status", "--porcelain");
    t.assertInfo(expected);
  }

  beforeEach(t.beforeHook);
  afterEach(t.afterHook);

  it("lists untracked files in name order", async () => {
    // Arrange
    await t.writeFile("file.txt", "");
    await t.writeFile("another.txt", "");

    // Act & Assert
    await assertStatusPorcelain(stripIndent`
    ?? another.txt
    ?? file.txt
    `);

    await assertStatus(stripIndent`
    Untracked files:

    \tanother.txt
    \tfile.txt

    nothing added to commit but untracked files present
    `);
  });

  it("lists files as untracked if they are not in the index", async () => {
    // Arrange
    await t.writeFile("committed.txt", "");
    await t.jitCmd("add", ".");

    await t.commit("commit message");

    await t.writeFile("file.txt", "");

    // Act & Assert
    await assertStatusPorcelain(stripIndent`
    ?? file.txt
    `);
  });

  it("lists untracked directories, not their contents", async () => {
    // Arrange
    await t.writeFile("file.txt", "");
    await t.writeFile("dir/another.txt", "");

    // Act & Assert
    await assertStatusPorcelain(stripIndent`
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
    await assertStatusPorcelain(stripIndent`
    ?? a/b/c/
    ?? a/outer.txt
    `);
  });

  it("does not list empty untracked directories", async () => {
    // Arrange
    await t.mkdir("outer");

    // Act & Assert
    await assertStatusPorcelain("");
  });

  it("lists untracked directories that indirectly contain files", async () => {
    await t.writeFile("outer/inner/file.txt", "");

    await assertStatusPorcelain(stripIndent`
    ?? outer/
    `);
  });

  describe("index/workspace changes", () => {
    beforeEach(async () => {
      await t.writeFile("1.txt", "one");
      await t.writeFile("a/2.txt", "two");
      await t.writeFile("a/b/3.txt", "three");

      await t.jitCmd("add", ".");
      await t.commit("commit message");
    });

    it("prints nothing when no files are changed", async () => {
      await assertStatusPorcelain("");
      await assertStatus("nothing to commit, working tree clean");
    });

    it("reports files with modified contents", async () => {
      // Arrange
      await t.writeFile("1.txt", "changed");
      await t.writeFile("a/2.txt", "modified");

      // Act & Assert
      await assertStatusPorcelain([" M 1.txt", " M a/2.txt"].join("\n"));
      await assertStatus(stripIndent`
      Changes not staged for commit:

      \tmodified:   1.txt
      \tmodified:   a/2.txt

      no changes added to commit
      `);
    });

    it("reports files with change modes", async () => {
      // Arrange
      await t.makeExecutable("a/2.txt");

      // Act & Assert
      await assertStatusPorcelain(" M a/2.txt");
    });

    it("reports modified files with unchanged size", async () => {
      await t.delay(1000); // Note: nano秒をtimestampで比較しないため, timestampを変えるために少し待つ
      await t.writeFile("a/b/3.txt", "hello");

      await assertStatusPorcelain(" M a/b/3.txt");
    });

    it("prints nothing if a file is touched", async () => {
      await t.delay(1000);
      await t.touch("1.txt");

      await assertStatusPorcelain("");
    });

    it("reports deleted files", async () => {
      await t.rm("a/2.txt");

      await assertStatusPorcelain(" D a/2.txt");
    });

    it("reports files in deleted directories", async () => {
      await t.rm("a");

      await assertStatusPorcelain([" D a/2.txt", " D a/b/3.txt"].join("\n"));
      await assertStatus(stripIndent`
      Changes not staged for commit:

      \tdeleted:    a/2.txt
      \tdeleted:    a/b/3.txt

      no changes added to commit
      `);
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

      await assertStatusPorcelain("A  a/4.txt");
      await assertStatus(stripIndent`
      Changes to be committed:

      \tnew file:   a/4.txt

      `);
    });

    it("reports a file added to an untracked directory", async () => {
      await t.writeFile("d/e/5.txt", "five");
      await t.jitCmd("add", ".");

      await assertStatusPorcelain("A  d/e/5.txt");
    });

    it("reports modified modes", async () => {
      await t.makeExecutable("1.txt");
      await t.jitCmd("add", ".");

      await assertStatusPorcelain("M  1.txt");
    });

    it("reports modified content", async () => {
      await t.writeFile("a/b/3.txt", "changed");
      await t.jitCmd("add", ".");

      await assertStatusPorcelain("M  a/b/3.txt");
    });

    it("reports deleted files", async () => {
      await t.rm("1.txt");
      await t.rm(".git/index");
      await t.jitCmd("add", ".");

      await assertStatusPorcelain("D  1.txt");
    });

    it("reports all deleted files inside directories", async () => {
      await t.rm("a");
      await t.rm(".git/index");
      await t.jitCmd("add", ".");

      await assertStatusPorcelain(stripIndent`
      D  a/2.txt
      D  a/b/3.txt
      `);
    });

    it("reports all types of status in the right order", async () => {
      await t.writeFile("z.txt", "z");
      await t.rm("a/2.txt");
      await t.writeFile("1.txt", "changed");
      await t.rm(".git/index");
      await t.jitCmd("add", ".");

      await assertStatus(stripIndent`
      Changes to be committed:

      \tmodified:   1.txt
      \tdeleted:    a/2.txt
      \tnew file:   z.txt

      `);
    });
  });
});
