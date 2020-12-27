import * as fsCb from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import * as assert from "power-assert";
import { Repository } from "../../src/repository";
import * as revlist from "../../src/rev_list";
import * as FileService from "../../src/services/FileService";
import * as T from "./helper";
import { RemoteRepo } from "./remote_repo";

const t = T.create("fetch");

describe("fetch", () => {
  let remote: RemoteRepo;

  beforeEach(t.beforeHook);
  afterEach(t.afterHook);

  async function writeCommit(message: string) {
    await remote.writeFile(`${message}.txt`, message);
    await remote.kitCmd("add", ".");
    await remote.commit(message);
  }

  async function commits(
    repo: Repository,
    revs: string[],
    options: Partial<revlist.Options> = {}
  ) {
    const list = await revlist.RevList.fromRevs(repo, revs, options);
    const _commits: string[] = [];
    for await (const commit of list) {
      _commits.push(repo.database.shortOid(commit.oid));
    }
    return _commits;
  }

  async function assertObjectCount(expectedCount: number) {
    const actual = await FileService.readdirRecursive(
      fs,
      path.join(t.repoPath, ".git", "objects")
    ).then((files) =>
      files.reduce(
        (acc, file) => (fsCb.statSync(file).isFile() ? acc + 1 : acc),
        0
      )
    );
    assert.equal(actual, expectedCount);
  }

  describe("with a single branch in the remote repository", () => {
    beforeEach(async () => {
      remote = new RemoteRepo("fetch-remote");
      await remote.kitCmd("init", remote.repoPath);

      for (const msg of ["one", "dir/two", "three"]) {
        await writeCommit(msg);
      }

      await t.kitCmd("remote", "add", "origin", `file://${remote.repoPath}`);
      await t.kitCmd(
        "config",
        "remote.origin.uploadpack",
        `${t.repoPath} upload-pack`
      );
    });

    afterEach(async () => {
      await FileService.rmrf(fs, remote.repoPath);
    });

    it("succeed", () => {
      assert(true);
    });
  });
});
