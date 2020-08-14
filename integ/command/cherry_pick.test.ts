import * as assert from "power-assert";
import { RevList } from "../../src/rev_list";
import { CompleteCommit, Dict } from "../../src/types";
import { stripIndent } from "../../src/util";
import * as T from "./helper";

const t = T.create("cherry_pick");

beforeEach(t.beforeHook);
afterEach(t.afterHook);

const getMessage = (commit: CompleteCommit) => commit.message;

describe("cherry pick", () => {
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

  describe("with two branches", () => {
    /*
     * one -- two -- three -- four  (master)
     *         |
     *         five -- six -- seven -- eight (topic)
     */
    beforeEach(async () => {
      for (const message of ["one", "two", "three", "four"]) {
        await commitTree(message, { "f.txt": message });
      }
      await t.kitCmd("branch", "topic", "@~2");
      await t.kitCmd("checkout", "topic");

      await commitTree("five", { "g.txt": "five" });
      await commitTree("six", { "f.txt": "six" });
      await commitTree("seven", { "g.txt": "seven" });
      await commitTree("eight", { "g.txt": "eight" });

      await t.kitCmd("checkout", "master");
    });

    it("applies a commit on top of the current HEAD", async () => {
      await t.kitCmd("cherry-pick", "topic~3");
      t.assertStatus(0);
      const commits = await t.history("@~3..");
      assert.deepEqual(commits.map(getMessage), ["five", "four", "three"]);

      await t.assertIndex([
        ["f.txt", "four"],
        ["g.txt", "five"],
      ]);

      await t.assertWorkspace([
        ["f.txt", "four"],
        ["g.txt", "five"]
      ]);
    });


    it("fails to apply a content conflict", async () => {
      await t.kitCmd("cherry-pick", "topic^^");
      t.assertStatus(1);

      const short = t.repo.database.shortOid(await t.resolveRevision("topic^^"));

      await t.assertWorkspace([
        ["f.txt", stripIndent`
        <<<<<<< HEAD
        four=======
        six>>>>>>> ${ short }... six

        `]
      ]);

      await t.kitCmd("status", "--porcelain");

      t.assertInfo("UU f.txt");
    });

    it("fails to apply a modify/delete conflict", async () => {
      await t.kitCmd("cherry-pick", "topic");
      t.assertStatus(1);


      await t.assertWorkspace([
        ["f.txt", "four"],
        ["g.txt", "eight"]
      ]);

      await t.kitCmd("status", "--porcelain");

      t.assertInfo("DU g.txt");
    });

    it("continues a conflicted cherry-pick", async () => {
      await t.kitCmd("cherry-pick", "topic");
      await t.kitCmd("add", "g.txt");

      await t.kitCmd("cherry-pick", "--continue");
      t.assertStatus(0);

      const commits = await t.history("@~3..");
      assert.deepEqual(commits[0].parents, [commits[1].oid]);

      assert.deepEqual(commits.map(commits => commits.message), ["eight", "four", "three"]);
      await t.assertIndex([
        ["f.txt", "four"],
        ["g.txt", "eight"]
      ]);

      await t.assertWorkspace([
        ["f.txt", "four"],
        ["g.txt", "eight"]
      ]);
    });

    it("commits after a conflicted cherry-pick", async () => {
      await t.kitCmd("cherry-pick", "topic");
      await t.kitCmd("add", "g.txt");

      await t.kitCmd("commit");

      t.assertStatus(0);
      const commits = await t.history("@~3..");
      assert.deepEqual(commits[0].parents, [commits[1].oid]);

      assert.deepEqual(commits.map(getMessage), ["eight", "four", "three"]);
    });

    it("applies multiple non-conflicting commits", async () => {
      await t.kitCmd("cherry-pick", "topic~3", "topic^", "topic");
      t.assertStatus(0);

      const commits = await t.history("@~4..");
      assert.deepEqual(commits.map(getMessage), ["eight", "seven", "five", "four"]);

      await t.assertIndex([
        ["f.txt", "four"],
        ["g.txt", "eight"]
      ]);

      await t.assertWorkspace([
        ["f.txt", "four"],
        ["g.txt", "eight"]
      ]);
    });

    it("stops when a list of commits includes a conflict", async () => {
      await t.kitCmd("cherry-pick", "topic^", "topic~3");
      t.assertStatus(1);

      await t.kitCmd("status", "--porcelain");
      t.assertInfo("DU g.txt");
    });

    it("stops when a range of commits includes a conflict", async () => {
      await t.kitCmd("cherry-pick", "..topic");
      t.assertStatus(1);

      await t.kitCmd("status", "--porcelain");
      t.assertInfo("UU f.txt");
    });

    it("refuses to commit in a conflicted state", async () => {
      await t.kitCmd("cherry-pick", "topic^", "topic~3");
      await t.kitCmd("commit");
      t.assertStatus(128);

      t.assertError(stripIndent`
        error: Committing is not possible because you have unmerged files.
        hint: Fix them up in the work tree, and then use 'kit add/rm <file>'
        hint: as appropriate to mark resolution and make a commit.
        fatal: Exiting because of an unresolved conflict.

      `);
    });

    it("refuses to commit in a conflicted state", async () => {
      await t.kitCmd("cherry-pick", "topic^", "topic~3");
      await t.kitCmd("cherry-pick", "--continue");
      t.assertStatus(128);

      t.assertError(stripIndent`
        error: Committing is not possible because you have unmerged files.
        hint: Fix them up in the work tree, and then use 'kit add/rm <file>'
        hint: as appropriate to mark resolution and make a commit.
        fatal: Exiting because of an unresolved conflict.

      `);
    });

    it("can continue after resolving the conflicts", async () => {
      await t.kitCmd("cherry-pick", "..topic");

      await t.writeFile("f.txt", "six");
      await t.kitCmd("add", "f.txt");

      await t.kitCmd("cherry-pick", "--continue");
      t.assertStatus(0);

      const commits = await t.history("@~5..");

      assert.deepEqual(commits.map(getMessage), ["eight", "seven", "six", "five", "four"]);

      await t.assertIndex([
        ["f.txt", "six"],
        ["g.txt", "eight"],
      ]);

      await t.assertWorkspace([
        ["f.txt", "six"],
        ["g.txt", "eight"],
      ]);
    });

    it("can continue after commiting resolved tree", async () => {
      await t.kitCmd("cherry-pick", "..topic");

      await t.writeFile("f.txt", "six");
      await t.kitCmd("add", "f.txt");
      await t.kitCmd("commit");

      await t.kitCmd("cherry-pick", "--continue");
      t.assertStatus(0);

      const commits = await t.history("@~5..");

      assert.deepEqual(commits.map(getMessage), ["eight", "seven", "six", "five", "four"]);
      await t.assertIndex([
        ["f.txt", "six"],
        ["g.txt", "eight"],
      ]);
      await t.assertWorkspace([
        ["f.txt", "six"],
        ["g.txt", "eight"],
      ]);
    });

      describe("aborting in conflicted state", () => {
        beforeEach(async () => {
          await t.kitCmd("cherry-pick", "..topic");
          await t.kitCmd("cherry-pick", "--abort");
        });

        it("exits successfully", async () => {
          t.assertStatus(0);
          t.assertError("");
        });

        it("resets to the old HEAD", async () => {
          assert.equal(await t.loadCommit("HEAD").then(getMessage), "four");

          await t.kitCmd("status", "--porcelain");
          t.assertInfo("");
        });

        it("removes the merge state", async () => {
          assert.equal(await t.repo.pendingCommit().inProgress(), false);
        });
      });

      describe("aborting in commited state", () => {
        beforeEach(async () => {
          await t.kitCmd("cherry-pick", "..topic");
          await t.kitCmd("add", ".");
          const spy = T.spyEditor("picked");
          await t.kitCmd("commit", "--amend");
          spy.restore();

          await t.kitCmd("cherry-pick", "--abort");
        });

        it("exits with a warning", async () => {
          t.assertStatus(0);
          t.assertWarn("warning: You seem to have moved HEAD. Not rewinding, check your HEAD!");
        });

        it("does not reset", async () => {
          assert.equal(await t.loadCommit("HEAD").then(getMessage), "picked");

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
        await t.kitCmd("cherry-pick", "..topic");
      });

      it("shows conflicting messages", async () => {
        await t.kitCmd("status");
        const oid = await t.repo.pendingCommit().mergeOid("cherry_pick");
        const short = t.repo.database.shortOid(oid);
        t.assertInfo(stripIndent`
          On branch master
          You are currently cherry-picking commit ${short}
            (fix conflicts and run 'kit cherry-pick --continue')
            (use 'kit cherry-pick --abort' to cancel the cherry-pick operation)

          Unmerged paths:

          \tboth modified:   f.txt

          nothing to commit, working tree clean
        `);
      });
    });
  });


});
