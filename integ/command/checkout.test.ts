import * as T from "./helper";
import { stripIndent } from "~/util";
const t = T.create();

describe("checkout", () => {
  beforeEach(t.beforeHook);
  afterEach(t.afterHook);

  describe("with a set of files", () => {
    async function commitAll() {
      await t.rm(".git/index");
      await t.jitCmd("add", ".");
      await t.commit("change");
    }

    async function commitAndCheckout(revision: string) {
      await commitAll();
      await t.jitCmd("checkout", revision);
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
      await t.jitCmd("status", "--porcelain");
      t.assertInfo(status);
    }

    const basefiles: T.Contents = [
      ["1.txt", "1"],
      ["outer/2.txt", "2"],
      ["outer/inner/3.txt", "3"],
    ];

    beforeEach(async () => {
      await Promise.all(
        basefiles.map(([name, content]) => t.writeFile(name, content))
      );
      await t.jitCmd("add", ".");
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

      await t.jitCmd("checkout", "@^");

      // Assert
      assertStaleFile("1.txt");
    });

    it("fails to update a modified-equal file", async () => {
      await t.writeFile("1.txt", "changed");
      await commitAll();

      await t.writeFile("1.txt", "1");
      await t.jitCmd("checkout", "@^");

      assertStaleFile("1.txt");
    });

    it("fails to update a modified-mode file", async () => {
      await t.writeFile("1.txt", "changed");
      await commitAll();

      await t.makeExecutable("1.txt");
      await t.jitCmd("checkout", "@^");

      assertStaleFile("1.txt");
    });

    it("restores a deleted file", async () => {
      await t.writeFile("1.txt", "changed");
      await commitAll();

      await t.rm("1.txt");
      await t.jitCmd("checkout", "@^");

      await t.assertWorkspace(basefiles);
      await assertStatus("");
    });

    it("restores files from a deleted directory", async () => {
      await t.writeFile("outer/inner/3.txt", "changed");
      await commitAll();

      await t.rm("outer");
      await t.jitCmd("checkout", "@^");

      await t.assertWorkspace(
        basefiles.filter(([n, c]) => n !== "outer/2.txt")
      );
      await assertStatus(" D outer/2.txt");
    });

    it("fails to update a staged file", async () => {
      await t.writeFile("1.txt", "changed");
      await commitAll();

      await t.writeFile("1.txt", "conflict");
      await t.jitCmd("add", ".");

      // Assert
      await t.jitCmd("checkout", "@^");
      assertStaleFile("1.txt");
    });

    it("updates a staged-equal file", async () => {
      await t.writeFile("1.txt", "changed");
      await commitAll();

      await t.writeFile("1.txt", "1");
      await t.jitCmd("add", ".");
      await t.jitCmd("checkout", "@^");

      // Assert
      await t.assertWorkspace(basefiles);
      await assertStatus("");
    });

    it("failes to update a staged changed-mode file", async () => {
      await t.writeFile("1.txt", "changed");
      await commitAll();

      await t.makeExecutable("1.txt");
      await t.jitCmd("add", ".");

      await t.jitCmd("checkout", "@^");
      assertStaleFile("1.txt");
    });

    it("failes to update an unindexed and untracked file", async () => {
      await t.writeFile("1.txt", "changed");
      await commitAll();

      await t.rm("1.txt");
      await t.rm(".git/index");
      await t.jitCmd("add", ".");
      await t.writeFile("1.txt", "conflict");

      await t.jitCmd("checkout", "@^");
      assertStaleFile("1.txt");
    });

    it("fails to update an unindex directory", async () => {
      await t.writeFile("outer/inner/3.txt", "changed");
      await commitAll();

      await t.rm("outer/inner");
      await t.rm(".git/index");
      await t.jitCmd("add", ".");

      await t.jitCmd("checkout", "@^");
      assertStaleFile("outer/inner/3.txt");
    });

    it("fails to update with a file at a parent path", async () => {
      await t.writeFile("outer/inner/3.txt", "changed");
      await commitAll();

      await t.rm("outer/inner");
      await t.writeFile("outer/inner", "conflict");

      await t.jitCmd("checkout", "@^");
      assertStaleFile("outer/inner/3.txt");
    });

    it("fails to update with a staged file at a parent path", async () => {
      await t.writeFile("outer/inner/3.txt", "changed");
      await commitAll();

      await t.rm("outer/inner");
      await t.writeFile("outer/inner", "conflict");
      await t.jitCmd("add", ".");

      await t.jitCmd("checkout", "@^");
      assertStaleFile("outer/inner/3.txt");
    });

    it("fails to update with an unstaged file at a parent path", async () => {
      await t.writeFile("outer/inner/3.txt", "changed");
      await commitAll();

      await t.rm("outer/inner");
      await t.rm(".git/index");
      await t.jitCmd("add", ".");
      await t.writeFile("outer/inner", "conflict");

      await t.jitCmd("checkout", "@^");
      assertStaleFile("outer/inner/3.txt");
    });

    it("fails to update with a file at a child path", async () => {
      await t.writeFile("outer/2.txt", "changed");
      await commitAll();

      await t.rm("outer/2.txt");
      await t.writeFile("outer/2.txt/extra.log", "conflict");

      await t.jitCmd("checkout", "@^");
      assertStaleFile("outer/2.txt");
    });

    it("fails to update with a staged file at a child path", async () => {
      await t.writeFile("outer/2.txt", "changed");
      await commitAll();

      await t.rm("outer/2.txt");
      await t.writeFile("outer/2.txt/extra.log", "conflict");
      await t.jitCmd("add", ".");

      await t.jitCmd("checkout", "@^");
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

      await t.jitCmd("checkout", "@^");
      assertStaleFile("outer/94.txt");
    });

    it("fails to remove a changed-mode file", async () => {
      await t.writeFile("outer/94.txt", "94");
      await commitAll();

      await t.makeExecutable("outer/94.txt");
      await t.jitCmd("checkout", "@^");
      assertStaleFile("outer/94.txt");
    });

    it("leaves a deleted file deleted", async () => {
      await t.writeFile("outer/94.txt", "94");
      await commitAll();

      await t.rm("outer/94.txt");
      await t.jitCmd("checkout", "@^");

      await t.assertWorkspace(basefiles);
      await assertStatus("");
    });

    it("leaves a deleted directory deleted", async () => {
      await t.writeFile("outer/inner/94.txt", "94");
      await commitAll();

      await t.rm("outer/inner");
      await t.jitCmd("checkout", "@^");

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
      await t.jitCmd("add", ".");

      await t.jitCmd("checkout", "@^");
      assertStaleFile("outer/94.txt");
    });

    it("fails to remove a staged changed-mode file", async () => {
      await t.writeFile("outer/94.txt", "94");
      await commitAll();

      await t.makeExecutable("outer/94.txt");
      await t.jitCmd("add", ".");

      await t.jitCmd("checkout", "@^");
      assertStaleFile("outer/94.txt");
    });

    it("leaves an unindexed file deleted", async () => {
      await t.writeFile("outer/94.txt", "94");
      await commitAll();

      await t.rm("outer/94.txt");
      await t.rm(".git/index");
      await t.jitCmd("add", ".");
      await t.jitCmd("checkout", "@^");

      await t.assertWorkspace(basefiles);
      await assertStatus("");
    });

    it("fails to remove an unindexed and untracked file", async () => {
      await t.writeFile("outer/94.txt", "94");
      await commitAll();

      await t.rm("outer/94.txt");
      await t.rm(".git/index");
      await t.jitCmd("add", ".");
      await t.writeFile("outer/94.txt", "conflict");

      await t.jitCmd("checkout", "@^");
      assertRemoveConflict("outer/94.txt");
    });

    it("leaves an unindexed directory deleted", async () => {
      await t.writeFile("outer/inner/94.txt", "94");
      await commitAll();

      await t.rm("outer/inner");
      await t.rm(".git/index");
      await t.jitCmd("add", ".");
      await t.jitCmd("checkout", "@^");

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
});
