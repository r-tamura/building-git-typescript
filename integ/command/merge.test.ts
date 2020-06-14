import * as T from "./helper";
import * as assert from "power-assert";
import { Dict } from "~/types";
import { stripIndent } from "~/util";

const t = T.create();

beforeAll(t.beforeHook);
afterAll(t.afterHook);

describe("merge", () => {
  async function commitTree(message: string, files: Dict<string>) {
    for (const [filepath, contents] of Object.entries(files)) {
      if (contents !== "x") {
        await t.rm(filepath);
      }
      if (contents === "x") {
        await t.makeExecutable(filepath);
      } else if (typeof contents === "string") {
        await t.writeFile(filepath, contents);
      } else if (Array.isArray(contents)) {
        await t.writeFile(filepath, contents[0]);
        await t.makeExecutable(filepath);
      }
    }
    await t.rm(".git/index");
    await t.kitCmd("add", ".");
    await t.commit(message);
  }

  describe("merging in ancestor", () => {
    beforeEach(async () => {
      await commitTree("A", { "f.txt": "1" });
      await commitTree("B", { "f.txt": "2" });
      await commitTree("C", { "f.txt": "3" });
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
      await commitTree("A", { "f.txt": "1" });
      await commitTree("B", { "f.txt": "2" });
      await commitTree("C", { "f.txt": "3" });

      await t.kitCmd("branch", "topic", "@^^");
      await t.kitCmd("checkout", "topic");

      t.mockStdio("M");
      await t.kitCmd("merge", "master");
    });

    it("prints the fast-forward message", async () => {
      // prettier-ignore
      const [a, b] = await Promise.all(["master^^", "master"].map((rev) => t.resolveRevision(rev)))

      t.assertInfo(stripIndent`
        Updating ${t.repo().database.shortOid(a)}..${t
        .repo()
        .database.shortOid(b)}
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
});
