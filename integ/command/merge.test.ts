import * as T from "./helper";
import * as assert from "power-assert";
import { Pathname } from "../../src/types";
import { stripIndent } from "../../src/util";
import { Stage } from "../../src/gindex";

const t = T.create();

beforeEach(t.beforeHook);
afterEach(t.afterHook);

describe("merge", () => {
  async function assertCleanMerge() {
    await t.kitCmd("status", "--porcelain");
    t.assertInfo("");

    const commit = await t.loadCommit("@");
    const oldHead = await t.loadCommit("@^");
    const mergeHead = await t.loadCommit("topic");

    assert.equal(commit.message.trim(), "M");
    assert.deepEqual(commit.parents, [oldHead.oid, mergeHead.oid]);
  }

  async function assertNoMerge() {
    const commit = await t.loadCommit("@");
    assert.equal(commit.message.trim(), "B");
    assert.equal(commit.parents.length, 1);
  }

  type TestIndexEntry = readonly [Pathname, Stage];
  async function assertIndex(...entries: TestIndexEntry[]) {
    await t.repo().index.load();
    const actual: TestIndexEntry[] = [];
    for (const entry of t.repo().index.eachEntry()) {
      actual.push([entry.name, entry.stage]);
    }
    assert.deepEqual(actual, entries);
  }

  describe("merging in ancestor", () => {
    beforeEach(async () => {
      await t.commitTree("A", { "f.txt": "1" });
      await t.commitTree("B", { "f.txt": "2" });
      await t.commitTree("C", { "f.txt": "3" });
      t.mockStdio("M");
      await t.kitCmd("merge", "@^");
    });

    it("prints the up-to-date message", async () => {
      t.assertInfo("Already up to date.");
    });

    it("does not change the repository state", async () => {
      const commit = await t.loadCommit("@");
      assert.equal("C", commit.message.trim());
    });
  });

  describe("fast-forward merge", () => {
    beforeEach(async () => {
      await t.commitTree("A", { "f.txt": "1" });
      await t.commitTree("B", { "f.txt": "2" });
      await t.commitTree("C", { "f.txt": "3" });

      await t.kitCmd("branch", "topic", "@^^");
      await t.kitCmd("checkout", "topic");

      t.mockStdio("M");
      await t.kitCmd("merge", "master");
    });

    it("prints the fast-forward message", async () => {
      // prettier-ignore
      const [a, b] = await Promise.all(["master^^", "master"].map((rev) => t.resolveRevision(rev)));

      t.assertInfo(stripIndent`
        Updating ${t.repo().database.shortOid(a)}..${t.repo().database.shortOid(b)}
        Fast-Forward
      `);
    });

    it("updates the current branch HEAD", async () => {
      const commit = await t.loadCommit("@");
      assert.equal("C", commit.message.trim());

      await t.kitCmd("status", "--porcelain");
      t.assertInfo("");
    });
  });

  describe("unconflicted merge with two files", () => {
    beforeEach(async () => {
      // prettier-ignore
      await t.merge3(
        { "f.txt": "1", "g.txt": "1" },
        { "f.txt": "2"              },
        {               "g.txt": "2" },
      );
    });

    it("puts the combined changes in the workspace", async () => {
      await t.assertWorkspace([
        ["f.txt", "2"],
        ["g.txt", "2"],
      ]);
    });

    it("creates a clean merge", async () => {
      await assertCleanMerge();
    });
  });

  describe("unconflicted merge with a deleted file", () => {
    beforeEach(async () => {
      // prettier-ignore
      await t.merge3(
        { "f.txt": "1", "g.txt": "1" },
        { "f.txt": "2"              },
        {               "g.txt": null },
      );
    });

    it("puts the combined changes in the workspace", async () => {
      await t.assertWorkspace([["f.txt", "2"]]);
    });

    it("creates a clean merge", async () => {
      await assertCleanMerge();
    });
  });

  describe("unconflicted merge: same addition on both sides", () => {
    beforeEach(async () => {
      // prettier-ignore
      await t.merge3(
        { "f.txt": "1" },
        { "g.txt": "2" },
        { "g.txt": "2" },
      );
    });

    it("puts the combined changes in the workspace", async () => {
      await t.assertWorkspace([
        ["f.txt", "1"],
        ["g.txt", "2"],
      ]);
    });

    it("creates a clean merge", async () => {
      await assertCleanMerge();
    });
  });

  describe("unconflicted merge: same edit on both sides", () => {
    beforeEach(async () => {
      // prettier-ignore
      await t.merge3(
        { "f.txt": "1" },
        { "f.txt": "2" },
        { "f.txt": "2" },
      );
    });

    it("puts the combined changes in the workspace", async () => {
      await t.assertWorkspace([["f.txt", "2"]]);
    });

    it("creates a clean merge", async () => {
      await assertCleanMerge();
    });
  });

  describe.skip("unconflicted merge: in-file merge possible", () => {
    beforeEach(async () => {
      // prettier-ignore
      await t.merge3(
        { "f.txt": "1\n2\n3\n" },
        { "f.txt": "4\n2\n3\n" },
        { "f.txt": "1\n2\n5\n" },
      );
    });

    it("puts the combined changes in the workspace", async () => {
      await t.assertWorkspace([["f.txt", "4\n2\n5\n"]]);
    });

    it("creates a clean merge", async () => {
      await assertCleanMerge();
    });
  });

  describe("unconflicted merge: edit and mode-change", () => {
    beforeEach(async () => {
      // prettier-ignore
      await t.merge3(
        { "f.txt": "1" },
        { "f.txt": "2" },
        { "f.txt": T.X },
      );
    });

    it("puts the combined changes in the workspace", async () => {
      await t.assertWorkspace([["f.txt", "2"]]);
      await t.assertExecutable("f.txt");
    });

    it("creates a clean merge", async () => {
      await assertCleanMerge();
    });
  });

  describe("unconflicted merge: mode-change and edit", () => {
    beforeEach(async () => {
      // prettier-ignore
      await t.merge3(
        { "f.txt": "1" },
        { "f.txt": T.X },
        { "f.txt": "3" },
      );
    });

    it("puts the combined changes in the workspace", async () => {
      await t.assertWorkspace([["f.txt", "3"]]);
      await t.assertExecutable("f.txt");
    });

    it("creates a clean merge", async () => {
      await assertCleanMerge();
    });
  });

  describe("unconflicted merge: same deletion on both sides", () => {
    beforeEach(async () => {
      // prettier-ignore
      await t.merge3(
        { "f.txt": "1", "g.txt": "1"  },
        {               "g.txt": null },
        {               "g.txt": null },
      );
    });

    it("puts the combined changes in the workspace", async () => {
      await t.assertWorkspace([["f.txt", "1"]]);
    });

    it("creates a clean merge", async () => {
      await assertCleanMerge();
    });
  });

  describe.skip("unconflicted merge: delete-add-parent", () => {
    beforeEach(async () => {
      // prettier-ignore
      await t.merge3(
        { "nest/f.txt": "1" },
        { "nest/f.txt": null },
        { "nest"      : "3" },
      );
    });

    it("puts the combined changes in the workspace", async () => {
      await t.assertWorkspace([["nest", "3"]]);
    });

    it("creates a clean merge", async () => {
      await assertCleanMerge();
    });
  });

  describe.skip("unconflicted merge: delete-add-child", () => {
    beforeEach(async () => {
      // prettier-ignore
      await t.merge3(
        { "nest/f.txt": "1" },
        { "nest/f.txt": null },
        { "nest/f.txt": null, "nest/f.txt/g.txt": "3" },
      );
    });

    it("puts the combined changes in the workspace", async () => {
      await t.assertWorkspace([["nest", "3"]]);
    });

    it("creates a clean merge", async () => {
      await assertCleanMerge();
    });
  });

  describe("conflicted merge: add-add", () => {
    beforeEach(async () => {
      // prettier-ignore
      await t.merge3(
        { "f.txt": "1"  },
        { "g.txt": "2\n" },
        { "g.txt": "3\n" },
      );
    });

    it("prints the merge conflicts", () => {
      t.assertInfo(stripIndent`
        Auto-merging g.txt
        CONFLICT (add/add): Merge conflict in g.txt
        Automatic merge failed; fix conflicts and then commit the result.
      `);
    });

    it("puts the conflicted file in the workspace", async () => {
      await t.assertWorkspace([
        ["f.txt", "1"],
        [
          "g.txt",
          stripIndent`
      <<<<<<< HEAD
      2
      =======
      3
      >>>>>>> topic

    `,
        ],
      ]);
    });

    it("records the conflict in the index", async () => {
      await assertIndex(["f.txt", 0], ["g.txt", 2], ["g.txt", 3]);
    });

    it("does not write a merge commit", async () => {
      await assertNoMerge();
    });
  });

  describe("conflicted merge: add-add mode conflict", () => {
    beforeEach(async () => {
      // prettier-ignore
      await t.merge3(
        { "f.txt": "1"  },
        { "g.txt": "2" },
        { "g.txt": ["2"] },
      );
    });

    it("prints the merge conflicts", () => {
      t.assertInfo(stripIndent`
        Auto-merging g.txt
        CONFLICT (add/add): Merge conflict in g.txt
        Automatic merge failed; fix conflicts and then commit the result.
      `);
    });

    it("puts the conflicted file in the workspace", async () => {
      await t.assertWorkspace([
        ["f.txt", "1"],
        ["g.txt", "2"],
      ]);
    });

    it("records the conflict in the index", async () => {
      await assertIndex(["f.txt", 0], ["g.txt", 2], ["g.txt", 3]);
    });

    it("does not write a merge commit", async () => {
      await assertNoMerge();
    });
  });

  describe("conflicted merge: file/directory addition", () => {
    beforeEach(async () => {
      // prettier-ignore
      await t.merge3(
        { "f.txt": "1" },
        { "g.txt": "2\n" },
        { "g.txt/three.txt": "3\n" },
      );
    });

    it("prints the merge conflicts", () => {
      t.assertInfo(stripIndent`
        Adding g.txt/three.txt
        CONFLICT (file/directory): There is a directory with name g.txt in topic. Adding g.txt as g.txt~HEAD
        Automatic merge failed; fix conflicts and then commit the result.
      `);
    });

    it("puts a namespaced copy of the conflicted file in the workspace", async () => {
      await t.assertWorkspace([
        ["f.txt", "1"],
        ["g.txt/three.txt", "3\n"],
        ["g.txt~HEAD", "2\n"],
      ]);
    });

    it("records the conflict in the index", async () => {
      await assertIndex(["f.txt", 0], ["g.txt", 2], ["g.txt/three.txt", 0]);
    });
  });

  describe("conflicted merge: directory/file addition", () => {
    beforeEach(async () => {
      // prettier-ignore
      await t.merge3(
        { "f.txt": "1" },
        { "g.txt/two.txt": "2\n" },
        { "g.txt": "3\n" }
      );
    });

    it("prints the merge conflicts", () => {
      t.assertInfo(stripIndent`
        Adding g.txt/two.txt
        CONFLICT (directory/file): There is a directory with name g.txt in HEAD. Adding g.txt as g.txt~topic
        Automatic merge failed; fix conflicts and then commit the result.
      `);
    });

    it("puts a namespaced copy of the conflicted file in the workspace", async () => {
      await t.assertWorkspace([
        ["f.txt", "1"],
        ["g.txt/two.txt", "2\n"],
        ["g.txt~topic", "3\n"],
      ]);
    });

    it("does not write a merge commit", async () => {
      await assertNoMerge();
    });

    it("records the conflict in the index", async () => {
      await assertIndex(["f.txt", 0], ["g.txt", 3], ["g.txt/two.txt", 0]);
    });
  });

  describe("conflicted merge: edit-edit", () => {
    beforeEach(async () => {
      // prettier-ignore
      await t.merge3(
        { "f.txt": "1"  },
        { "f.txt": "2\n" },
        { "f.txt": "3\n" },
      );
    });

    it("prints the merge conflicts", () => {
      t.assertInfo(stripIndent`
        Auto-merging f.txt
        CONFLICT (content): Merge conflict in f.txt
        Automatic merge failed; fix conflicts and then commit the result.
      `);
    });

    it("puts the conflicted file in the workspace", async () => {
      await t.assertWorkspace([
        [
          "f.txt",
          stripIndent`
      <<<<<<< HEAD
      2
      =======
      3
      >>>>>>> topic

    `,
        ],
      ]);
    });

    it("records the conflict in the index", async () => {
      await assertIndex(["f.txt", 1], ["f.txt", 2], ["f.txt", 3]);
    });

    it("does not write a merge commit", async () => {
      await assertNoMerge();
    });
  });

  describe("conflicted merge: edit-delete", () => {
    beforeEach(async () => {
      // prettier-ignore
      await t.merge3(
        { "f.txt": "1" },
        { "f.txt": "2" },
        { "f.txt": null },
      );
    });

    it("prints the merge conflicts", () => {
      t.assertInfo(stripIndent`
        CONFLICT (modify/delete): f.txt deleted in topic and modified in HEAD. Version HEAD of f.txt left in tree.
        Automatic merge failed; fix conflicts and then commit the result.
      `);
    });

    it("puts the conflicted file in the workspace", async () => {
      await t.assertWorkspace([["f.txt", "2"]]);
    });

    it("records the conflict in the index", async () => {
      await assertIndex(["f.txt", 1], ["f.txt", 2]);
    });

    it("does not write a merge commit", async () => {
      await assertNoMerge();
    });
  });

  describe("conflicted merge: delete-edit", () => {
    beforeEach(async () => {
      // prettier-ignore
      await t.merge3(
        { "f.txt": "1" },
        { "f.txt": null },
        { "f.txt": "2" },
      );
    });

    it("prints the merge conflicts", () => {
      t.assertInfo(stripIndent`
        CONFLICT (modify/delete): f.txt deleted in HEAD and modified in topic. Version topic of f.txt left in tree.
        Automatic merge failed; fix conflicts and then commit the result.
      `);
    });

    it("puts the conflicted file in the workspace", async () => {
      await t.assertWorkspace([["f.txt", "2"]]);
    });

    it("records the conflict in the index", async () => {
      await assertIndex(["f.txt", 1], ["f.txt", 3]);
    });

    it("does not write a merge commit", async () => {
      await assertNoMerge();
    });
  });

  describe("conflicted merge: edit-add-parent", () => {
    beforeEach(async () => {
      // prettier-ignore
      await t.merge3(
        { "nest/f.txt": "1" },
        { "nest/f.txt": "2" },
        { "nest": "3" },
      );
    });

    it("prints the merge conflicts", () => {
      t.assertInfo(stripIndent`
      CONFLICT (modify/delete): nest/f.txt deleted in topic and modified in HEAD. Version HEAD of nest/f.txt left in tree.
      CONFLICT (directory/file): There is a directory with name nest in HEAD. Adding nest as nest~topic
      Automatic merge failed; fix conflicts and then commit the result.
      `);
    });

    it("puts the conflicted file in the workspace", async () => {
      await t.assertWorkspace([
        ["nest/f.txt", "2"],
        ["nest~topic", "3"],
      ]);
    });

    it("records the conflict in the index", async () => {
      await assertIndex(["nest", 3], ["nest/f.txt", 1], ["nest/f.txt", 2]);
    });

    it("does not write a merge commit", async () => {
      await assertNoMerge();
    });
  });

  describe("conflicted merge: edit-add-child", () => {
    beforeEach(async () => {
      // prettier-ignore
      await t.merge3(
        { "nest/f.txt": "1" },
        { "nest/f.txt": "2" },
        { "nest/f.txt": null, "nest/f.txt/g.txt": "3" },
      );
    });

    it("prints the merge conflicts", () => {
      t.assertInfo(stripIndent`
      Adding nest/f.txt/g.txt
      CONFLICT (modify/delete): nest/f.txt deleted in topic and modified in HEAD. Version HEAD of nest/f.txt left in tree at nest/f.txt~HEAD.
      Automatic merge failed; fix conflicts and then commit the result.
      `);
    });

    it("puts the conflicted file in the workspace", async () => {
      await t.assertWorkspace([
        ["nest/f.txt/g.txt", "3"],
        ["nest/f.txt~HEAD", "2"],
      ]);
    });

    it("records the conflict in the index", async () => {
      await assertIndex(["nest/f.txt", 1], ["nest/f.txt", 2], ["nest/f.txt/g.txt", 0]);
    });

    it("does not write a merge commit", async () => {
      await assertNoMerge();
    });
  });

  describe("conflict resolution", () => {
    beforeEach(async () => {
      await t.merge3({ "f.txt": "1\n" }, { "f.txt": "2\n" }, { "f.txt": "3\n" });
    });

    it("prevents commits with unmerged entries", async () => {
      t.mockStdio("B");
      await t.kitCmd("commit");

      t.assertError(stripIndent`
        error: Committing is not possible because you have unmerged files.
        hint: Fix them up in the work tree, and then use 'kit add/rm <file>'
        hint: as appropriate to mark resolution and make a commit.
        fatal: Exiting because of an unresolved conflict.

      `);
      t.assertStatus(128);

      assert.equal((await t.loadCommit("@")).message, "B");
    });

    it("prevents merge --continue with unmerged entries", async () => {
      t.mockStdio("B");
      await t.kitCmd("merge", "--continue");

      t.assertError(stripIndent`
        error: Committing is not possible because you have unmerged files.
        hint: Fix them up in the work tree, and then use 'kit add/rm <file>'
        hint: as appropriate to mark resolution and make a commit.
        fatal: Exiting because of an unresolved conflict.

      `);
      t.assertStatus(128);

      assert.equal((await t.loadCommit("@")).message, "B");
    });

    it("commits a merge after resolving conflicts", async () => {
      await t.kitCmd("add", "f.txt");
      await t.kitCmd("commit");

      t.assertStatus(0);

      const commit = await t.loadCommit("@");
      assert.equal(commit.message, "M");

      const parents = [];
      for await (const parent of commit.parents.map((oid) => t.loadCommit(oid))) {
        parents.push(parent);
      }
      assert.deepEqual(
        parents.map((p) => p.message),
        ["B", "C"]
      );
    });

    it("allows merge --continue after resolving conflicts", async () => {
      await t.kitCmd("add", "f.txt");
      await t.kitCmd("merge", "--continue");

      t.assertStatus(0);

      const commit = await t.loadCommit("@");
      assert.equal(commit.message, "M");

      const parents = [];
      for await (const parent of commit.parents.map((oid) => t.loadCommit(oid))) {
        parents.push(parent);
      }
      assert.deepEqual(
        parents.map((p) => p.message),
        ["B", "C"]
      );
    });

    it.skip("prevents merge --continue when non is in progress", async () => {
      await t.kitCmd("add", "f.txt");
      await t.kitCmd("merge", "--continue");
      await t.kitCmd("merge", "--continue");

      t.assertError("fatal: There is no merge in progress (MERGE_HEAD missing).\n");
      t.assertStatus(128);
    });

    it.skip("aborts the merge", async () => {
      await t.kitCmd("merge", "--abort");
      await t.kitCmd("status", "--porcelain");
      t.assertInfo("");
    });

    it.skip("prevents aborting a merge when none is in progress", async () => {
      await t.kitCmd("merge", "--abort");
      await t.kitCmd("merge", "--abort");

      t.assertError("fatal: There is no merge in progress (MERGE_HEAD missing).\n");
      t.assertStatus(128);
    });

    it("prevents starting a new merge while one is in progress", async () => {
      await t.kitCmd("merge");
      t.assertError(stripIndent`
        error: Merging is not possible because you have unmerged files.
        hint: Fix them up in the work tree, and then use 'kit add/rm <file>'
        hint: as appropriate to mark resolution and make a commit.
        fatal: Exiting because of an unresolved conflict.

      `);
      t.assertStatus(128);
    });
  });
});
