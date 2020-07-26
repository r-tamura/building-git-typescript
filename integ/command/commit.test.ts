import * as path from "path";
import * as assert from "power-assert";
import * as T from "./helper";

const t = T.create("commit");

beforeEach(t.beforeHook);
afterEach(t.afterHook);

describe("commit", () => {
  it("親コミットが存在しないとき、rootコミットであるメッセージを出力する", async () => {
    await t.commit("first");

    const commit = await t.loadCommit("HEAD");
    t.assertInfo(`[master (root-commit) ${t.repo.database.shortOid(commit.oid)}] first`);
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
    t.assertInfo(`[master ${t.repo.database.shortOid(commit.oid)}] message from file`);
  });
});
