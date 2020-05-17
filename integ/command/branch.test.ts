import * as T from "./helper";
import * as assert from "power-assert";
import { stripIndent } from "~/util";

const t = T.create();

describe("branch", () => {
  beforeEach(t.beforeHook);
  afterEach(t.afterHook);

  async function writeCommit(message: string) {
    await t.writeFile("file.txt", message);
    await t.jitCmd("add", ".");
    await t.commit(message);
  }

  describe("with no commit", () => {
    it.skip("無効なmasterブランチのため失敗する", async () => {
      // TODO: fix
      await t.jitCmd("branch", "topic");
      t.assertError("fatal: Not a valid object name: 'master'.");
    });

    it("空のリストが出力される", async () => {
      await t.jitCmd("branch");
      t.assertInfo("");
    });
  });

  describe("with a chain of commits", () => {
    beforeEach(async () => {
      for (const msg of ["first", "second", "third"]) {
        await writeCommit(msg);
      }
    });

    it("creates a branch pointing at HEAD", async () => {
      await t.jitCmd("branch", "topic");

      assert.equal(
        await t.repo().refs.readHead(),
        await t.repo().refs.readRef("topic")
      );
    });

    it("fails for invalid branch names", async () => {
      await t.jitCmd("branch", "^");

      t.assertError(stripIndent`
        fatal: '^' is not a valid branch name.
      `);
    });

    it("fails for existing branch names", async () => {
      await t.jitCmd("branch", "topic");
      await t.jitCmd("branch", "topic");

      t.assertError(stripIndent`
        fatal: A branch named 'topic' already exists.
      `);
    });

    it("creats a branch from a short commit ID", async () => {
      const id = await t.resolveRevision("@~2");
      await t.jitCmd("branch", "topic", t.repo().database.shortOid(id));

      assert.equal(await t.repo().refs.readRef("topic"), id);
    });

    it("fails for invalid revisions", async () => {
      await t.jitCmd("branch", "topic", "^");

      t.assertError("fatal: Not a valid object name: '^'.");
    });

    it("fails for invalid refs", async () => {
      await t.jitCmd("branch", "topic", "no-such-branch");

      t.assertError("fatal: Not a valid object name: 'no-such-branch'.");
    });

    it("fails for invalid parents", async () => {
      await t.jitCmd("branch", "topic", "@^^^");

      t.assertError("fatal: Not a valid object name: '@^^^'.");
    });

    it.skip("fails for invalid parents 2", async () => {
      // TODO: fix
      await t.jitCmd("branch", "topic", "@^^^^");

      t.assertError("fatal: Not a valid object name: '@^^^^'.");
    });

    it.skip("fails for invalid ancestors", async () => {
      // TODO: fix
      await t.jitCmd("branch", "topic", "@~50");

      t.assertError("fatail: Not a valid object name '@~50'.");
    });

    it("fails for parents of revisions that are not commit", async () => {
      const head = await t.repo().refs.readHead();
      if (head === null) {
        assert.fail();
      }
      const o = await t.repo().database.load(head);
      if (o.type !== "commit") {
        assert.fail();
      }

      await t.jitCmd("branch", "topic", `${o.tree}^^`);

      t.assertError(stripIndent`
        error: object ${o.tree} is a tree, not a commit
        fatal: Not a valid object name: '${o.tree}^^'.
      `);
    });

    it("lists existing branchs with verbose info", async () => {
      await t.jitCmd("branch", "new-feature");
      await t.jitCmd("branch");
      t.assertInfo(stripIndent`
        * master
          new-feature
      `);
    });

    it("lists existing branches with verbose info", async () => {
      const a = await t.loadCommit("@^");
      const b = await t.loadCommit("@");

      await t.jitCmd("branch", "new-feature", "@^");
      await t.jitCmd("branch", "--verbose");

      const a_short = t.repo().database.shortOid(a.oid);
      const b_short = t.repo().database.shortOid(b.oid);
      t.assertInfo(stripIndent`
        * master      ${b_short} third
          new-feature ${a_short} second
      `);
    });
  });
});
