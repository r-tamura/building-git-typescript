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

      const revs = await RevList.fromRevs(t.repo, ["@~3.."]);
      assert.deepEqual(await T.getRevListMessages(revs), ["five", "four", "three"]);

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

    it.skip("applies multiple non-conflicting commits", async () => {
      await t.kitCmd("cherry-pick", "topic~3", "topic", "topic");
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
  });
});
