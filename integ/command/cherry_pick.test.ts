import * as assert from "power-assert";
import { RevList } from "../../src/rev_list";
import { Dict } from "../../src/types";
import { stripIndent } from "../../src/util";
import * as T from "./helper";

const t = T.create("cherry_pick");

beforeEach(t.beforeHook);
afterEach(t.afterHook);

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

      await commitTree("five", { "g.txt":  "five"});
      await commitTree("six", { "g.txt":  "six"});
      await commitTree("seven", { "g.txt":  "seven"});
      await commitTree("eight", { "g.txt":  "eight"});

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


    it.skip("fails to apply a content conflict", async () => {
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
  });
});
