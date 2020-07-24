import * as assert from "power-assert";
import * as T from "./helper";
import { stripIndent } from "../../src/util";
const t = T.create();

describe("checkout", () => {
  beforeEach(t.beforeHook);
  afterEach(t.afterHook);

  describe("with a set of files", () => {
    async function commitAll() {
      await t.rm(".git/index");
      await t.kitCmd("add", ".");
      await t.commit("change");
    }

    async function commitAndCheckout(revision: string) {
      await commitAll();
      await t.kitCmd("checkout", revision);
    }

    function assertStaleFile(filename: string) {
      t.assertError(stripIndent`
        error: Your local changes to the following files would be overwritten by checkout:
        \t${filename}
        Please commit your changes or stash them before you switch branches.
        Aborting.
      `);
    }

    function assertRemoveConflict(filename: string) {
      t.assertError(stripIndent`
        error: The following untracked working tree files would be removed by checkout:
        \t${filename}
        Please move or remove them before you switch branches.
        Aborting.
      `);
    }

    async function assertStatus(status: string) {
      await t.kitCmd("status", "--porcelain");
      t.assertInfo(status);
    }

    const basefiles: T.Contents = [
      ["1.txt", "1"],
      ["outer/2.txt", "2"],
      ["outer/inner/3.txt", "3"],
    ];

    beforeEach(async () => {
      await Promise.all(basefiles.map(([name, content]) => t.writeFile(name, content)));
      await t.kitCmd("add", ".");
      await t.commit("first");
    });

    it("update a changed file", async () => {
      // Act
      await t.writeFile("1.txt", "changed");
      await commitAndCheckout("@^");

      // Assert
      await t.assertWorkspace(basefiles);
      await assertStatus("");
    });
    it("fails to update a modified file", async () => {
      await t.writeFile("1.txt", "changed");
      await commitAll();

      await t.writeFile("1.txt", "conflict");

      await t.kitCmd("checkout", "@^");

      // Assert
      assertStaleFile("1.txt");
    });

    it("fails to update a modified-equal file", async () => {
      await t.writeFile("1.txt", "changed");
      await commitAll();

      await t.writeFile("1.txt", "1");
      await t.kitCmd("checkout", "@^");

      assertStaleFile("1.txt");
    });

    it("fails to update a modified-mode file", async () => {
      await t.writeFile("1.txt", "changed");
      await commitAll();

      await t.makeExecutable("1.txt");
      await t.kitCmd("checkout", "@^");

      assertStaleFile("1.txt");
    });

    it("restores a deleted file", async () => {
      await t.writeFile("1.txt", "changed");
      await commitAll();

      await t.rm("1.txt");
      await t.kitCmd("checkout", "@^");

      await t.assertWorkspace(basefiles);
      await assertStatus("");
    });

    it("restores files from a deleted directory", async () => {
      await t.writeFile("outer/inner/3.txt", "changed");
      await commitAll();

      await t.rm("outer");
      await t.kitCmd("checkout", "@^");

      await t.assertWorkspace(basefiles.filter(([n, c]) => n !== "outer/2.txt"));
      await assertStatus(" D outer/2.txt");
    });

    it("fails to update a staged file", async () => {
      await t.writeFile("1.txt", "changed");
      await commitAll();

      await t.writeFile("1.txt", "conflict");
      await t.kitCmd("add", ".");

      // Assert
      await t.kitCmd("checkout", "@^");
      assertStaleFile("1.txt");
    });

    it("updates a staged-equal file", async () => {
      await t.writeFile("1.txt", "changed");
      await commitAll();

      await t.writeFile("1.txt", "1");
      await t.kitCmd("add", ".");
      await t.kitCmd("checkout", "@^");

      // Assert
      await t.assertWorkspace(basefiles);
      await assertStatus("");
    });

    it("failes to update a staged changed-mode file", async () => {
      await t.writeFile("1.txt", "changed");
      await commitAll();

      await t.makeExecutable("1.txt");
      await t.kitCmd("add", ".");

      await t.kitCmd("checkout", "@^");
      assertStaleFile("1.txt");
    });

    it("failes to update an unindexed and untracked file", async () => {
      await t.writeFile("1.txt", "changed");
      await commitAll();

      await t.rm("1.txt");
      await t.rm(".git/index");
      await t.kitCmd("add", ".");
      await t.writeFile("1.txt", "conflict");

      await t.kitCmd("checkout", "@^");
      assertStaleFile("1.txt");
    });

    it("fails to update an unindex directory", async () => {
      await t.writeFile("outer/inner/3.txt", "changed");
      await commitAll();

      await t.rm("outer/inner");
      await t.rm(".git/index");
      await t.kitCmd("add", ".");

      await t.kitCmd("checkout", "@^");
      assertStaleFile("outer/inner/3.txt");
    });

    it("fails to update with a file at a parent path", async () => {
      await t.writeFile("outer/inner/3.txt", "changed");
      await commitAll();

      await t.rm("outer/inner");
      await t.writeFile("outer/inner", "conflict");

      await t.kitCmd("checkout", "@^");
      assertStaleFile("outer/inner/3.txt");
    });

    it("fails to update with a staged file at a parent path", async () => {
      await t.writeFile("outer/inner/3.txt", "changed");
      await commitAll();

      await t.rm("outer/inner");
      await t.writeFile("outer/inner", "conflict");
      await t.kitCmd("add", ".");

      await t.kitCmd("checkout", "@^");
      assertStaleFile("outer/inner/3.txt");
    });

    it("fails to update with an unstaged file at a parent path", async () => {
      await t.writeFile("outer/inner/3.txt", "changed");
      await commitAll();

      await t.rm("outer/inner");
      await t.rm(".git/index");
      await t.kitCmd("add", ".");
      await t.writeFile("outer/inner", "conflict");

      await t.kitCmd("checkout", "@^");
      assertStaleFile("outer/inner/3.txt");
    });

    it("fails to update with a file at a child path", async () => {
      await t.writeFile("outer/2.txt", "changed");
      await commitAll();

      await t.rm("outer/2.txt");
      await t.writeFile("outer/2.txt/extra.log", "conflict");

      await t.kitCmd("checkout", "@^");
      assertStaleFile("outer/2.txt");
    });

    it("fails to update with a staged file at a child path", async () => {
      await t.writeFile("outer/2.txt", "changed");
      await commitAll();

      await t.rm("outer/2.txt");
      await t.writeFile("outer/2.txt/extra.log", "conflict");
      await t.kitCmd("add", ".");

      await t.kitCmd("checkout", "@^");
      assertStaleFile("outer/2.txt");
    });

    it("removes a file", async () => {
      await t.writeFile("94.txt", "94");
      await commitAndCheckout("@^");

      await t.assertWorkspace(basefiles);
      await assertStatus("");
    });

    it("removes a file from an existing directory", async () => {
      await t.writeFile("outer/94.txt", "94");
      await commitAndCheckout("@^");

      await t.assertWorkspace(basefiles);
      await assertStatus("");
    });

    it("removes a file from a new directory", async () => {
      await t.writeFile("new/94.txt", "94");
      await commitAndCheckout("@^");

      await t.assertWorkspace(basefiles);
      await t.assertNoent("new");
      await assertStatus("");
    });

    it("removes a file from a new nested directory", async () => {
      await t.writeFile("new/inner/94.txt", "94");
      await commitAndCheckout("@^");

      await t.assertWorkspace(basefiles);
      await t.assertNoent("new");
      await assertStatus("");
    });

    it("removes a file from a non-empty directory", async () => {
      await t.writeFile("outer/94.txt", "94");
      await commitAndCheckout("@^");

      await t.assertWorkspace(basefiles);
      await assertStatus("");
    });

    it("fails to remove a modified file", async () => {
      await t.writeFile("outer/94.txt", "94");
      await commitAll();

      await t.writeFile("outer/94.txt", "conflict");

      await t.kitCmd("checkout", "@^");
      assertStaleFile("outer/94.txt");
    });

    it("fails to remove a changed-mode file", async () => {
      await t.writeFile("outer/94.txt", "94");
      await commitAll();

      await t.makeExecutable("outer/94.txt");
      await t.kitCmd("checkout", "@^");
      assertStaleFile("outer/94.txt");
    });

    it("leaves a deleted file deleted", async () => {
      await t.writeFile("outer/94.txt", "94");
      await commitAll();

      await t.rm("outer/94.txt");
      await t.kitCmd("checkout", "@^");

      await t.assertWorkspace(basefiles);
      await assertStatus("");
    });

    it("leaves a deleted directory deleted", async () => {
      await t.writeFile("outer/inner/94.txt", "94");
      await commitAll();

      await t.rm("outer/inner");
      await t.kitCmd("checkout", "@^");

      await t.assertWorkspace([
        ["1.txt", "1"],
        ["outer/2.txt", "2"],
      ]);

      await assertStatus(" D outer/inner/3.txt");
    });

    it("fails to remove a staged file", async () => {
      await t.writeFile("outer/94.txt", "94");
      await commitAll();

      await t.writeFile("outer/94.txt", "conflict");
      await t.kitCmd("add", ".");

      await t.kitCmd("checkout", "@^");
      assertStaleFile("outer/94.txt");
    });

    it("fails to remove a staged changed-mode file", async () => {
      await t.writeFile("outer/94.txt", "94");
      await commitAll();

      await t.makeExecutable("outer/94.txt");
      await t.kitCmd("add", ".");

      await t.kitCmd("checkout", "@^");
      assertStaleFile("outer/94.txt");
    });

    it("leaves an unindexed file deleted", async () => {
      await t.writeFile("outer/94.txt", "94");
      await commitAll();

      await t.rm("outer/94.txt");
      await t.rm(".git/index");
      await t.kitCmd("add", ".");
      await t.kitCmd("checkout", "@^");

      await t.assertWorkspace(basefiles);
      await assertStatus("");
    });

    it("fails to remove an unindexed and untracked file", async () => {
      await t.writeFile("outer/94.txt", "94");
      await commitAll();

      await t.rm("outer/94.txt");
      await t.rm(".git/index");
      await t.kitCmd("add", ".");
      await t.writeFile("outer/94.txt", "conflict");

      await t.kitCmd("checkout", "@^");
      assertRemoveConflict("outer/94.txt");
    });

    it("leaves an unindexed directory deleted", async () => {
      await t.writeFile("outer/inner/94.txt", "94");
      await commitAll();

      await t.rm("outer/inner");
      await t.rm(".git/index");
      await t.kitCmd("add", ".");
      await t.kitCmd("checkout", "@^");

      await t.assertWorkspace([
        ["1.txt", "1"],
        ["outer/2.txt", "2"],
      ]);
      await assertStatus("D  outer/inner/3.txt");
    });

    it("adds a file", async () => {
      await t.rm("1.txt");
      await commitAndCheckout("@^");

      await t.assertWorkspace(basefiles);
      await assertStatus("");
    });
  });

  describe("with a chain of commits", () => {
    beforeEach(async () => {
      for (const message of ["first", "second", "third"]) {
        await t.writeFile("file.txt", message);
        await t.kitCmd("add", ".");
        await t.commit(message);
      }
      await t.kitCmd("branch", "topic");
      await t.kitCmd("branch", "second", "@^");
    });

    describe("checking out a branch", () => {
      beforeEach(async () => {
        await t.kitCmd("checkout", "topic");
      });

      it("links HEAD to the branch", async () => {
        assert.equal(await t.repo.refs.currentRef().then((res) => res.path), "refs/heads/topic");
      });

      it("resolves HEAD to the same object as the branch", async () => {
        assert.equal(await t.repo.refs.readHead(), await t.repo.refs.readRef("topic"));
      });

      it("prints a message when switing to the same branch", async () => {
        await t.kitCmd("checkout", "topic");

        t.assertError("Already on 'topic'");
      });

      it("prints a message when swtching to another branch", async () => {
        await t.kitCmd("checkout", "second");

        t.assertError("Switched to branch 'second'");
      });

      it("prints a warning message when detaching HEAD", async () => {
        const shortOid = await t.resolveRevision("@").then((rev) => t.repo.database.shortOid(rev));

        await t.kitCmd("checkout", "@");

        t.assertWarn(stripIndent`
          Note: checking out '@'.

          You are in 'detached HEAD' state. You can look around, make experimental
          changes and commit them, and you can discard any commits you make in this
          state without impacting any branches by performing another checkout.

          If you want to create a new branch to retain commits you create, you may
          do so (now or later) by using the branch command. Example:

            jit branch <new-branch-name>

        `);

        t.assertError(`HEAD is now at ${shortOid} third`);
      });
    });
  });
});
