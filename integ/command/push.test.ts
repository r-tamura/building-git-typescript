import * as assert from "assert";
import * as fsCb from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import { Repository } from "../../src/repository";
import * as revlist from "../../src/rev_list";
import * as FileService from "../../src/services/FileService";
import { stripIndent } from "../../src/util";
import * as T from "./helper";
import { RemoteRepo } from "./remote_repo";

const t = T.create();

describe("push", () => {
  let remote: RemoteRepo;
  beforeEach(t.beforeHook);
  afterEach(t.afterHook);

  async function createRemoteRepo(name: string): Promise<RemoteRepo> {
    const remoteRepo = new RemoteRepo(name);
    await remoteRepo.kitCmd("init", remoteRepo.repoPath);
    await remoteRepo.kitCmd("config", "receive.denyCurrentBranch", "false");
    await remoteRepo.kitCmd("config", "receive.denyCurrentCurrent", "false");
    return remoteRepo;
  }

  async function writeCommit(message: string) {
    await remote.writeFile(`${message}.txt`, message);
    await remote.kitCmd("add", ".");
    await remote.commit(message);
  }

  async function commits(
    repo: Repository,
    revs: string[],
    options: Partial<revlist.Options> = {}
  ): Promise<string[]> {
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

  function kitPath() {
    return path.join(__dirname, "../../bin/kit");
  }

  describe("with a single branch in the local repository", () => {
    beforeEach(async () => {
      remote = await createRemoteRepo("push-remote");

      for (const msg of ["one", "dir/two", "three"]) {
        await writeCommit(msg);
      }

      await t.kitCmd("remote", "add", "origin", `file://${remote.repoPath}`);
      await t.kitCmd(
        "config",
        "remote.origin.receivepack",
        `${kitPath()} receive-pack`
      );
      await t.kitCmd(
        "config",
        "remote.origin.receivepack",
        `${kitPath()} upload-pack`
      );
    });

    afterEach(async () => {
      await FileService.rmrf(fs, remote.repoPath);
    });

    it.skip("displays a new branch being pushed", async () => {
      await t.kitCmd("push", "origin", "master");
      t.assertStatus(0);
      t.assertError(stripIndent`
      To file://${remote.repoPath}
      * [new branch] master -> master
      `);
    });
  });
});
