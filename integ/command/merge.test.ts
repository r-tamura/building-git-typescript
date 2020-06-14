import * as T from "./helper";
import * as assert from "power-assert";
import { Dict } from "~/types";

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
      t.mockStdio("mergeee");
      await t.kitCmd("merge", "@^");
    });

    it("prints the up-to-date message", async () => {
      t.assertInfo("Already up to date.");
    });

    it.skip("does not change the repository state", async () => {
      const commit = await t.loadCommit("@");
      assert.equal("C", commit.message.trim());
    });
  });
});
