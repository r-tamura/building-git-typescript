import * as assert from "power-assert";
import { CompleteCommit, Dict } from "../../src/types";
import * as TextUtil from "../../src/util/text";
import * as T from "./helper";

const t = T.create("revert");

beforeEach(t.beforeHook);
afterEach(t.afterHook);

const getTitle = (c: CompleteCommit) => {
  const title = c.titleLine();
  if (!title) {
    throw new Error(`title is '${title}'`);
  }
  return TextUtil.strip(title);
}

describe("revert", () => {
  let time: Date;
  async function commitTree(message: string, files: Dict<string>) {
    time ??= new Date();
    time = T.addSeconds(time, 10);

    for (const [pathname, contents] of Object.entries(files)) {
      await t.writeFile(pathname, contents);
    }
    await t.kitCmd("add", ".");
    await t.commit(message, { time });
  }

  describe("with a chain of commits", () => {
    beforeEach(async () => {

      for (const message of ["one", "two", "three", "four"]) {
        await commitTree(message, { "f.txt": message });
      }

      await commitTree("five", {"g.txt": "five"});
      await commitTree("six", {"f.txt": "six"});
      await commitTree("seven", {"g.txt": "seven"});
      await commitTree("eight", {"g.txt": "eight"});
    });

    it("reverts a commit on top of the current HEAD", async () => {
      await t.kitCmd("revert", "@~2");
      t.assertStatus(0);

      const commits = await t.history("@~3..");

      assert.deepEqual(commits.map(getTitle), ["Revert \"six\"", "eight", "seven"]);

      await t.assertIndex([
        ["f.txt", "four"],
        ["g.txt", "eight"],
      ]);

      await t.assertWorkspace([
        ["f.txt", "four"],
        ["g.txt", "eight"],
      ]);
    });

    it("failes to revert a content conflict", async () => {
      await t.kitCmd("revert", "@~4");
      t.assertStatus(1);

      const short = await t.resolveRevision("@~4").then(t.repo.database.shortOid);

      await t.assertWorkspace([
        ["f.txt", TextUtil.stripIndent`
          <<<<<<< HEAD
          six=======
          three>>>>>>> parent of ${short}... four

        `],
        ["g.txt", "eight"],
      ]);

      await t.kitCmd("status", "--porcelain");

      t.assertInfo("UU f.txt");

    });

    it("failes to revert a modify/delete conflict", async () => {
      await t.kitCmd("revert", "@~3");
      t.assertStatus(1);

      await t.assertWorkspace([
        ["f.txt", "six"],
        ["g.txt", "eight"],
      ]);

      await t.kitCmd("status", "--porcelain");

      t.assertInfo("UD g.txt");

    });

    it("continues a conflicted revert", async () => {
      await t.kitCmd("revert", "@~3");
      await t.kitCmd("add", "g.txt");

      await t.kitCmd("revert", "--continue");
      t.assertStatus(0);

      const commits = await t.history("@~3..");
      assert.deepEqual(commits[0].parents, [commits[1].oid]);

      assert.deepEqual(commits.map(getTitle), ["Revert \"five\"", "eight", "seven"]);

      await t.assertIndex([
        ["f.txt", "six"],
        ["g.txt", "eight"],
      ]);

      await t.assertWorkspace([
        ["f.txt", "six"],
        ["g.txt", "eight"],
      ]);
    });

    it("commits after a conflicted revert", async () => {
      await t.kitCmd("revert", "@~3");
      await t.kitCmd("add", "g.txt");

      await t.kitCmd("commit");
      t.assertStatus(0);

      const commits = await t.history("@~3..");
      assert.deepEqual(commits[0].parents, [commits[1].oid]);

      assert.deepEqual(commits.map(getTitle), ["Revert \"five\"", "eight", "seven"]);
    });

    it("applies multiple non-conflicting commits", async () => {
      await t.kitCmd("revert", "@", "@^", "@^^");
      t.assertStatus(0);

      const commits = await t.history("@~4..");
      assert.deepEqual(commits.map(getTitle), ["Revert \"six\"", "Revert \"seven\"", "Revert \"eight\"", "eight"]);

      await t.assertIndex([
        ["f.txt", "four"],
        ["g.txt", "five"],
      ]);

      await t.assertWorkspace([
        ["f.txt", "four"],
        ["g.txt", "five"],
      ]);
    });

    it("stops when a list of commits includes a conflict", async () => {
      await t.kitCmd("revert", "@^", "@");
      t.assertStatus(1);

      await t.kitCmd("status", "--porcelain");
      t.assertInfo("UU g.txt");
    });

    it("stops when a range of commits includes a conflict", async () => {
      await t.kitCmd("revert", "@~5..@~2");
      t.assertStatus(1);

      await t.kitCmd("status", "--porcelain");
      t.assertInfo("UD g.txt");
    });

    it("refuses to commit in a conflicted state", async () => {
      await t.kitCmd("revert", "@~5..@~2");
      await t.kitCmd("commit");

      t.assertStatus(128);

      t.assertError(TextUtil.stripIndent`
        error: Committing is not possible because you have unmerged files.
        hint: Fix them up in the work tree, and then use 'kit add/rm <file>'
        hint: as appropriate to mark resolution and make a commit.
        fatal: Exiting because of an unresolved conflict.

      `);
    });

    it("refuses to commit in a conflicted state", async () => {
      await t.kitCmd("revert", "@~5..@~2");
      await t.kitCmd("revert", "--continue");

      t.assertStatus(128);

      t.assertError(TextUtil.stripIndent`
        error: Committing is not possible because you have unmerged files.
        hint: Fix them up in the work tree, and then use 'kit add/rm <file>'
        hint: as appropriate to mark resolution and make a commit.
        fatal: Exiting because of an unresolved conflict.

      `);
    });

    it("can continue after resolving the conflicts", async () => {
      await t.kitCmd("revert", "@~4..@^");

      await t.writeFile("g.txt", "five");
      await t.kitCmd("add", "g.txt");

      await t.kitCmd("revert", "--continue");
      t.assertStatus(0);

      const commits = await t.history("@~4..");
      assert.deepEqual(commits.map(getTitle), ["Revert \"five\"", "Revert \"six\"", "Revert \"seven\"", "eight"]);

      await t.assertIndex([
        ["f.txt", "four"],
      ]);

      await t.assertWorkspace([
        ["f.txt", "four"],
      ]);
    });

    it("can continue after commiting the conflicts", async () => {
      await t.kitCmd("revert", "@~4..@^");

      await t.writeFile("g.txt", "five");
      await t.kitCmd("add", "g.txt");
      await t.kitCmd("commit");

      await t.kitCmd("revert", "--continue");
      t.assertStatus(0);

      const commits = await t.history("@~4..");
      assert.deepEqual(commits.map(getTitle), ["Revert \"five\"", "Revert \"six\"", "Revert \"seven\"", "eight"]);

      await t.assertIndex([
        ["f.txt", "four"],
      ]);

      await t.assertWorkspace([
        ["f.txt", "four"],
      ]);
    });

    describe("aborting in a conflicted state", () => {
      beforeEach(async () => {
        await t.kitCmd("revert", "@~5..@^");
        await t.kitCmd("revert", "--abort");
      });

      it("exits successfully", async () => {
        t.assertStatus(0);
        t.assertError("");
      });

      it("rests to the old HEAD", async () => {
        assert.equal((await t.loadCommit("HEAD")).message, "eight");

        await t.kitCmd("status", "--porcelain");
        t.assertInfo("");
      });

      it("removes the merge state", async () => {
        assert.equal(await t.repo.pendingCommit().inProgress(), false);
      });
    });

    describe("aborting in a commited state", () => {
      beforeEach(async () => {
        await t.kitCmd("revert", "@~5..@^");
        await t.kitCmd("add", ".");
        const spy = T.spyEditor("reverted");
        await t.kitCmd("commit");
        spy.restore();

        await t.kitCmd("revert", "--abort");
      });

      it("exits with a warning", async () => {
        t.assertStatus(0);
        t.assertWarn("warning: You seem to have moved HEAD. Not rewinding, check your HEAD!");
      });

      it("does not reset HEAD", async () => {
        assert.equal((await t.loadCommit("HEAD")).message, "reverted");

        await t.kitCmd("status", "--porcelain");
        t.assertInfo("");
      });

      it("removes the merge state", async () => {
        assert.equal(await t.repo.pendingCommit().inProgress(), false);
      });
    });

    // 追加テスト
    describe("print conflicting messages", () => {
      beforeEach(async () => {
        await t.kitCmd("revert", "@~5..@^");
      });

      it("shows conflicting messages", async () => {
        await t.kitCmd("status");
        const oid = await t.repo.pendingCommit().mergeOid("revert");
        const short = t.repo.database.shortOid(oid);
        t.assertInfo(TextUtil.stripIndent`
          On branch master
          You are currently reverting commit ${short}
            (fix conflicts and run 'kit revert --continue')
            (use 'kit revert --abort' to cancel the revert operation)

          Unmerged paths:

          \tboth modified:   g.txt

          nothing to commit, working tree clean
        `);
      });
    });
  });
});
