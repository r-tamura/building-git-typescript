import * as path from "path";
import * as assert from "power-assert";
import { Editor } from "../../src/editor";
import { RevList } from "../../src/rev_list";
import * as T from "./helper";

const t = T.create("commit");

beforeEach(t.beforeHook);
afterEach(t.afterHook);

describe("commit", () => {
  it("親コミットが存在しないとき、rootコミットであるメッセージを出力する", async () => {
    await t.commit("first");

    const commit = await t.loadCommit("HEAD");
    t.assertInfo(
      `[master (root-commit) ${t.repo.database.shortOid(commit.oid)}] first`
    );
  });

  it("親コミットが存在するとき、rootコミットであるメッセージを出力しない", async () => {
    await t.commit("first");
    await t.commit("second");

    const commit = await t.loadCommit("HEAD");
    t.assertInfo(`[master ${t.repo.database.shortOid(commit.oid)}] second`);
  });

  it("ブランチ名が出力される", async () => {
    await t.commit("first");
    await t.kitCmd("branch", "topic");
    await t.kitCmd("checkout", "topic");
    await t.commit("second");

    const commit = await t.loadCommit("HEAD");
    t.assertInfo(`[topic ${t.repo.database.shortOid(commit.oid)}] second`);
  });

  it("ファイルからコミットメッセージを読み込む", async () => {
    await t.writeFile("message.txt", "message from file");
    await t.kitCmd("commit", "--message", "first");
    await t.kitCmd("commit", "--file", path.join(t.repoPath, "message.txt"));
    const commit = await t.loadCommit("HEAD");
    t.assertInfo(
      `[master ${t.repo.database.shortOid(commit.oid)}] message from file`
    );
  });

  describe("committing to branches", () => {
    beforeEach(async () => {
      const commits = ["first", "second", "third"];
      for (const message of commits) {
        await t.writeFile("file.txt", message);
        await t.kitCmd("add", ".");
        await t.commit(message);
      }

      await t.kitCmd("branch", "topic");
      await t.kitCmd("checkout", "topic");
    });

    async function commitChange(content: string) {
      await t.writeFile("file.txt", content);
      await t.kitCmd("add", ".");
      await t.commit(content);
    }

    describe("on a branch", () => {
      it("advances a branch pointer", async () => {
        const headBefore = await t.repo.refs.readRef("HEAD");
        await commitChange("change");
        const headAfter = await t.repo.refs.readRef("HEAD");
        const branchAfter = await t.repo.refs.readRef("topic");

        assert.notEqual(headBefore, headAfter);
        assert.equal(headAfter, branchAfter);
        assert.equal(headBefore, await t.resolveRevision("@^"));
      });
    });
  });

  describe("configuring an author", () => {
    beforeEach(async () => {
      await t.kitCmd("config", "user.name", "A. N. User");
      await t.kitCmd("config", "user.email", "user@example.com");
    });

    it("uses the author information from the config", async () => {
      await t.writeFile("file.txt", "1");
      await t.kitCmd("add", ".");
      await t.commit("first", { author: false });
    });
  });

  describe("reusing messages", () => {
    beforeEach(async () => {
      await t.writeFile("file.txt", "1");
      await t.kitCmd("add", ".");
      await t.commit("first");
    });

    it("uses the message from another commit", async () => {
      await t.writeFile("file.txt", "2");
      await t.kitCmd("add", ".");
      await t.kitCmd("commit", "-C", "@");
      const revs = await RevList.fromRevs(t.repo, ["HEAD"]);
      const messages = await T.getRevListMessages(revs);
      assert.deepEqual(messages, ["first", "first"]);
    });
  });

  describe("amending commits", () => {
    beforeEach(async () => {
      const messages = ["first", "second", "third"];
      for (const message of messages) {
        await t.writeFile("file.txt", message);
        await t.kitCmd("add", ".");
        await t.commit(message);
      }
    });

    it("replaces the last commit;s message", async () => {
      const editorSpy = jest
        .spyOn(Editor, "edit")
        .mockResolvedValue("third [amended]");
      await t.kitCmd("commit", "--amend");
      const revs = await RevList.fromRevs(t.repo, ["HEAD"]);
      const messages = await T.getRevListMessages(revs);
      assert.deepEqual(messages, ["third [amended]", "second", "first"]);

      editorSpy.mockRestore();
    });

    it("replace the last commit's tree", async () => {
      await t.writeFile("another.txt", "1");
      await t.kitCmd("add", "another.txt");
      await t.kitCmd("commit", "--amend");

      const commit = await t.loadCommit("HEAD");
      const diff = await t.repo.database.treeDiff(commit.parent, commit.oid);
      const files: string[] = [];
      for (const file of diff.keys()) {
        files.push(file);
      }
      assert.deepEqual(files.sort(), ["another.txt", "file.txt"]);
    });
  });
});
