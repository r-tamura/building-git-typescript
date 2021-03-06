import { CompleteCommit, OID } from "../../src/types";
import * as assert from "power-assert";
import * as T from "./helper";

const t = T.create("reset");

beforeEach(t.beforeHook);
afterEach(t.afterHook);

describe("reset", () => {
  describe.skip("with no HEAD commit", () => {
    beforeEach(async () => {
      await t.writeFile("a.txt", "1");
      await t.writeFile("outer/b.txt", "2");
      await t.writeFile("outer/inner/c.txt", "3");

      await t.kitCmd("add", ".");
    });

    async function assertUnchangedWorkspace() {
      return t.assertWorkspace([
        ["a.txt", "1"],
        ["outer/b.txt", "2"],
        ["outer/inner/c.txt", "3"],
      ]);
    }

    it("removes everything from the index", async () => {
      await t.kitCmd("reset");
      await t.assertIndex([]);
      await assertUnchangedWorkspace();
    });
  });

  describe("with a HEAD commit", () => {
    let headOid: OID;
    beforeEach(async () => {
      await t.writeFile("a.txt", "1");
      await t.writeFile("outer/b.txt", "2");
      await t.writeFile("outer/inner/c.txt", "3");

      await t.kitCmd("add", ".");
      await t.commit("first");

      await t.writeFile("outer/b.txt", "4");
      await t.kitCmd("add", ".");
      await t.commit("second");

      await t.kitCmd("rm", "a.txt");
      await t.writeFile("outer/d.txt", "5");
      await t.writeFile("outer/inner/c.txt", "6");
      await t.kitCmd("add", ".");
      await t.writeFile("outer/e.txt", "7");

      // 一回以上コミットしているのでHEADが存在する
      headOid = (await t.repo.refs.readHead()) as OID;
    });

    async function assertUnchangedHead() {
      assert.equal(headOid, await t.repo.refs.readHead());
    }

    async function assertUnchangedWorkspace() {
      return t.assertWorkspace([
        ["outer/b.txt", "4"],
        ["outer/d.txt", "5"],
        ["outer/e.txt", "7"],
        ["outer/inner/c.txt", "6"],
      ]);
    }

    it("restores a file removed from the index", async () => {
      await t.kitCmd("reset", "a.txt");
      await t.assertIndex([
        ["a.txt", "1"],
        ["outer/b.txt", "4"],
        ["outer/d.txt", "5"],
        ["outer/inner/c.txt", "6"],
      ]);

      await assertUnchangedHead();
      await assertUnchangedWorkspace();
    });

    it("resets a file modified in the index", async () => {
      await t.kitCmd("reset", "outer/inner");
      await t.assertIndex([
        ["outer/b.txt", "4"],
        ["outer/d.txt", "5"],
        ["outer/inner/c.txt", "3"],
      ]);

      await assertUnchangedHead();
      await assertUnchangedWorkspace();
    });

    it("removes a file added to the index", async () => {
      await t.kitCmd("reset", "outer/d.txt");
      await t.assertIndex([
        ["outer/b.txt", "4"],
        ["outer/inner/c.txt", "6"],
      ]);

      await assertUnchangedHead();
      await assertUnchangedWorkspace();
    });

    it("removes a file added to the index", async () => {
      await t.kitCmd("reset", "@^", "outer/b.txt");
      await t.assertIndex([
        ["outer/b.txt", "2"],
        ["outer/d.txt", "5"],
        ["outer/inner/c.txt", "6"],
      ]);

      await assertUnchangedHead();
      await assertUnchangedWorkspace();
    });

    it("resets the whole index", async () => {
      await t.kitCmd("reset");
      await t.assertIndex([
        ["a.txt", "1"],
        ["outer/b.txt", "4"],
        ["outer/inner/c.txt", "3"],
      ]);

      await assertUnchangedHead();
      await assertUnchangedWorkspace();
    });

    it("resets the whole index and moves HEAD", async () => {
      await t.kitCmd("reset", "@^");
      await t.assertIndex([
        ["a.txt", "1"],
        ["outer/b.txt", "2"],
        ["outer/inner/c.txt", "3"],
      ]);

      assert.equal(
        ((await t.repo.database.load(headOid)) as CompleteCommit).parent,
        await t.repo.refs.readHead()
      );

      await assertUnchangedWorkspace();
    });

    it("moves HEAD and leaves the index unchanged", async () => {
      await t.kitCmd("reset", "--soft", "@^");

      await t.assertIndex([
        ["outer/b.txt", "4"],
        ["outer/d.txt", "5"],
        ["outer/inner/c.txt", "6"],
      ]);

      assert.equal(
        ((await t.repo.database.load(headOid)) as CompleteCommit).parent,
        await t.repo.refs.readHead()
      );

      await assertUnchangedWorkspace();
    });

    it("rests the index and workspace", async () => {
      await t.writeFile("a.txt/nested", "remove me");
      await t.writeFile("outer/b.txt", "10");
      await t.rm("outer/inner");

      await t.kitCmd("reset", "--hard");

      await assertUnchangedHead();

      await t.assertIndex([
        ["a.txt", "1"],
        ["outer/b.txt", "4"],
        ["outer/inner/c.txt", "3"],
      ]);

      await t.kitCmd("status", "--porcelain");
      t.assertInfo("?? outer/e.txt");
    });

    it("lets you return to the previous stat using ORIG_HEAD", async () => {
      await t.kitCmd("reset", "--hard", "@^");

      await t.assertIndex([
        ["a.txt", "1"],
        ["outer/b.txt", "2"],
        ["outer/inner/c.txt", "3"],
      ]);

      await t.kitCmd("reset", "--hard", "ORIG_HEAD");
      await t.assertIndex([
        ["a.txt", "1"],
        ["outer/b.txt", "4"],
        ["outer/inner/c.txt", "3"],
      ]);
    });
  });
});
