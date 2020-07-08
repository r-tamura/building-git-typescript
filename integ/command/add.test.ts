import * as assert from "assert";
import * as T from "./helper";
import { stripIndent } from "../../src/util";

const t = T.create();

describe("add", () => {
  async function assertIndex(expected: [number, string][]) {
    const repo = t.repo();
    await repo.index.load();
    const actual: [number, string][] = repo.index.eachEntry().map((e) => [e.mode, e.name]);
    assert.deepEqual(actual, expected);
  }

  beforeEach(t.beforeHook);
  afterEach(t.afterHook);

  it("adds a regular file to the index", async () => {
    await t.writeFile("hello.txt", "hello");

    await t.kitCmd("add", "hello.txt");

    await assertIndex([[0o0100644, "hello.txt"]]);
  });

  it("adds an executable file to the index", async () => {
    await t.writeFile("hello.txt", "hello");
    await t.makeExecutable("hello.txt");

    await t.kitCmd("add", "hello.txt");

    await assertIndex([[0o0100755, "hello.txt"]]);
  });

  it("adds multiple files to the index", async () => {
    await t.writeFile("hello.txt", "hello");
    await t.writeFile("world.txt", "world");

    await t.kitCmd("add", "hello.txt", "world.txt");

    await assertIndex([
      [0o0100644, "hello.txt"],
      [0o0100644, "world.txt"],
    ]);
  });

  it("adds multiple files to the index", async () => {
    await t.writeFile("hello.txt", "hello");
    await t.writeFile("world.txt", "world");

    await t.kitCmd("add", "world.txt");

    await assertIndex([[0o0100644, "world.txt"]]);

    await t.kitCmd("add", "hello.txt");

    await assertIndex([
      [0o0100644, "hello.txt"],
      [0o0100644, "world.txt"],
    ]);
  });

  it("adds a directory to the index", async () => {
    await t.writeFile("a-dir/nested.txt", "content");

    await t.kitCmd("add", "a-dir");

    await assertIndex([[0o0100644, "a-dir/nested.txt"]]);
  });

  it("adds the repository root to the index", async () => {
    await t.writeFile("a/b/c/file.txt", "content");
    await t.kitCmd("add", ".");
    await assertIndex([[0o0100644, "a/b/c/file.txt"]]);
  });

  it("is silent on success", async () => {
    await t.writeFile("hello.txt", "hello");

    await t.kitCmd("add", "hello.txt");

    t.assertStatus(0);
    t.assertInfo("");
    t.assertError("");
  });

  it("fails for no-existent files", async () => {
    await t.kitCmd("add", "no-such-file");

    t.assertError("fatal: pathspec 'no-such-file' did not match any files");
    t.assertStatus(128);
    await assertIndex([]);
  });

  it("fails for unreadable files", async () => {
    // Arrange
    await t.writeFile("secret.txt", "");
    await t.makeUnreadable("secret.txt");

    // Act
    await t.kitCmd("add", "secret.txt");

    // Assert
    t.assertError(stripIndent`
      error: open('secret.txt'): Permission denied
      fatal: adding files failed
    `);
  });
});
