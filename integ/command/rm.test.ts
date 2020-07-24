import * as assert from "power-assert";
import { stripIndent } from "../../src/util";
import * as T from "./helper";

const t = T.create("rm");

beforeEach(t.beforeHook);
afterEach(t.afterHook);

describe("rm", () => {
  describe("with a single file", () => {
    beforeEach(async () => {
      await t.writeFile("f.txt", "1");
      await t.kitCmd("add", ".");
      await t.commit("first");
    });

    it("exits successfully", async () => {
      await t.kitCmd("rm", "f.txt");
      t.assertStatus(0);
    });

    it("removes a file from the index", async () => {
      await t.kitCmd("rm", "f.txt");

      await t.repo.index.load();
      assert.equal(t.repo.index.trackedFile("f.txt"), false);
    });

    it("removes a file from the workspace", async () => {
      await t.kitCmd("rm", "f.txt");
      await t.assertWorkspace([]);
    });

    it("succeeds if the file is not in the workspace", async () => {
      await t.rm("f.txt");
      await t.kitCmd("rm", "f.txt");

      t.assertStatus(0);

      await t.repo.index.load();
      assert.equal(t.repo.index.trackedFile("f.txt"), false);
    });

    it("fails if the file is not in the index", async () => {
      await t.kitCmd("rm", "nope.txt");
      t.assertStatus(128);
      t.assertError("fatal: pathspec 'nope.txt' did not match any files");
    });

    it("fails if the file has unstaged changes", async () => {
      await T.delay(1000); // ファイル更新時間が同じになると、差分として検出されないため
      await t.writeFile("f.txt", "2");
      await t.kitCmd("rm", "f.txt");

      t.assertError(stripIndent`
        error: the following file has local modifications:
           f.txt
      `);

      t.assertStatus(1);

      await t.repo.index.load();
      assert.equal(t.repo.index.trackedFile("f.txt"), true);
      await t.assertWorkspace([["f.txt", "2"]]);
    });

    it("fails if the file has uncommitted changes", async () => {
      await T.delay(1000); // ファイル更新時間が同じになると、差分として検出されないため
      await t.writeFile("f.txt", "2");
      await t.kitCmd("add", "f.txt");
      await t.kitCmd("rm", "f.txt");

      t.assertError(stripIndent`
        error: the following file has changes staged in the index:
           f.txt
      `);

      t.assertStatus(1);

      await t.repo.index.load();
      assert.equal(t.repo.index.trackedFile("f.txt"), true);
      await t.assertWorkspace([["f.txt", "2"]]);
    });

    it("forces removal of unstaged changed", async () => {
      await T.delay(1000);
      await t.writeFile("f.txt", "2");
      await t.kitCmd("rm", "-f", "f.txt");

      await t.repo.index.load();
      assert.equal(t.repo.index.trackedFile("f.txt"), false);
      await t.assertWorkspace([]);
    });

    it("forces removal of uncommitted changed", async () => {
      await T.delay(1000);
      await t.writeFile("f.txt", "2");
      await t.kitCmd("add", "f.txt");
      await t.kitCmd("rm", "-f", "f.txt");

      await t.repo.index.load();
      assert.equal(t.repo.index.trackedFile("f.txt"), false);
      await t.assertWorkspace([]);
    });

    it("removes a file only from the index", async () => {
      await t.kitCmd("rm", "--cached", "f.txt");

      await t.repo.index.load();
      assert.equal(t.repo.index.trackedFile("f.txt"), false);
      await t.assertWorkspace([["f.txt", "1"]]);
    });

    it("removes a file from the index if it has unstaged changes", async () => {
      await T.delay(1000);
      await t.writeFile("f.txt", "2");
      await t.kitCmd("rm", "--cached", "f.txt");

      await t.repo.index.load();
      assert.equal(t.repo.index.trackedFile("f.txt"), false);
      await t.assertWorkspace([["f.txt", "2"]]);
    });

    it("removes a file from the index if it has uncommitted changes", async () => {
      await T.delay(1000);
      await t.writeFile("f.txt", "2");
      await t.kitCmd("add", "f.txt");
      await t.kitCmd("rm", "--cached", "f.txt");

      await t.repo.index.load();
      assert.equal(t.repo.index.trackedFile("f.txt"), false);
      await t.assertWorkspace([["f.txt", "2"]]);
    });

    it("does not remove a file with both uncommitted and unstaged changes", async () => {
      await T.delay(1000);
      await t.writeFile("f.txt", "2");
      await t.kitCmd("add", "f.txt");
      await T.delay(1000);
      await t.writeFile("f.txt", "3");
      await t.kitCmd("rm", "--cached", "f.txt");

      t.assertError(stripIndent`
        error: the following file has staged content different from both the file and the HEAD:
           f.txt
      `);

      t.assertStatus(1);

      await t.repo.index.load();
      assert.equal(t.repo.index.trackedFile("f.txt"), true);
      await t.assertWorkspace([["f.txt", "3"]]);
    });
  });

  describe("with a tree", () => {
    beforeEach(async () => {
      await t.writeFile("f.txt", "1");
      await t.writeFile("outer/g.txt", "2");
      await t.writeFile("outer/inner/h.txt", "3");

      await t.kitCmd("add", ".");
      await t.commit("first");
    });

    it("removes multiple files", async () => {
      await t.kitCmd("rm", "f.txt", "outer/inner/h.txt");

      await t.repo.index.load();
      assert.deepEqual(
        t.repo.index.eachEntry().map((e) => e.name),
        ["outer/g.txt"]
      );
      await t.assertWorkspace([["outer/g.txt", "2"]]);
    });

    it("refuses to remove a directory", async () => {
      await t.kitCmd("rm", "f.txt", "outer");

      t.assertError("fatal: not removing 'outer' recursively without -r");
      t.assertStatus(128);

      await t.repo.index.load();
      assert.deepEqual(
        t.repo.index.eachEntry().map((e) => e.name),
        ["f.txt", "outer/g.txt", "outer/inner/h.txt"]
      );

      await t.assertWorkspace([
        ["f.txt", "1"],
        ["outer/g.txt", "2"],
        ["outer/inner/h.txt", "3"],
      ]);
    });

    it("does not remove a file replaced with a directory", async () => {
      await t.rm("f.txt");
      await t.writeFile("f.txt/nested", "keep me");
      await t.kitCmd("rm", "f.txt");

      t.assertError("fatal: kit rm: 'f.txt': Operation not permitted");
      t.assertStatus(128);

      await t.repo.index.load();
      assert.deepEqual(
        t.repo.index.eachEntry().map((e) => e.name),
        ["f.txt", "outer/g.txt", "outer/inner/h.txt"]
      );

      await t.assertWorkspace([
        ["f.txt/nested", "keep me"],
        ["outer/g.txt", "2"],
        ["outer/inner/h.txt", "3"],
      ]);
    });

    it("removes a directory with -r", async () => {
      await t.kitCmd("rm", "-r", "outer");

      await t.repo.index.load();
      assert.deepEqual(
        t.repo.index.eachEntry().map((e) => e.name),
        ["f.txt"]
      );

      await t.assertWorkspace([["f.txt", "1"]]);
    });

    it("does not remove untracked files", async () => {
      await t.writeFile("outer/inner/j.txt", "4");
      await t.kitCmd("rm", "-r", "outer");

      await t.repo.index.load();
      assert.deepEqual(
        t.repo.index.eachEntry().map((e) => e.name),
        ["f.txt"]
      );

      await t.assertWorkspace([
        ["f.txt", "1"],
        ["outer/inner/j.txt", "4"],
      ]);
    });
  });
});
