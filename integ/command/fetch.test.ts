import * as fsCb from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import * as assert from "power-assert";
import { Repository } from "../../src/repository";
import * as revlist from "../../src/rev_list";
import * as FileService from "../../src/services/FileService";
import { stripIndent } from "../../src/util";
import * as T from "./helper";
import { RemoteRepo } from "./remote_repo";

const t = T.create("fetch");

jest.setTimeout(10000);

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

  function kitPath() {
    return path.join(__dirname, "../../bin/kit");
  }

  describe("with a single branch in the remote repository", () => {
    beforeEach(async () => {
      fsCb.truncateSync(
        "/Users/r-tamura/Documents/GitHub/building-git-typescript/__upload-pack.log"
      );
      fsCb.truncateSync(
        "/Users/r-tamura/Documents/GitHub/building-git-typescript/__fetch.log"
      );
    });

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
        `${kitPath()} upload-pack`
      );
    });

    afterEach(async () => {
      await FileService.rmrf(fs, remote.repoPath);
    });

    it("display a new branch being fetched", async () => {
      await t.kitCmd("fetch");
      t.assertStatus(0);

      t.assertError(stripIndent`
        From file://${remote.repoPath}
        * [new branch] master -> origin/master
      `);
    });

    it("maps the remote's heads/* to the local's remotes/origin/*", async () => {
      await t.kitCmd("fetch");
      assert.equal(
        await remote.repo.refs.readRef("refs/heads/master"),
        await t.repo.refs.readRef("refs/remotes/origin/master")
      );
    });

    it("maps the remote's heads/* to a different local ref", async () => {
      await t.kitCmd(
        "fetch",
        "origin",
        "refs/heads/*:refs/remotes/other/prefix-*"
      );

      assert.equal(
        await remote.repo.refs.readRef("refs/heads/master"),
        await t.repo.refs.readRef("refs/remotes/other/prefix-master")
      );
    });

    it.skip("accepts short-hand refs in the fetch refspec", async () => {
      await t.kitCmd("fetch", "origin", "master:topic");

      assert.equal(
        await remote.repo.refs.readRef("refs/heads/master"),
        await t.repo.refs.readRef("refs/remotes/topic")
      );
    });

    it.skip("accepts short-hand refs in the fetch refspec", async () => {
      await t.kitCmd("fetch", "origin", "master:heads/topic");

      assert.equal(
        await remote.repo.refs.readRef("refs/heads/master"),
        await t.repo.refs.readRef("refs/remotes/topic")
      );
    });

    it("does not create any other local refs", async () => {
      await t.kitCmd("fetch");

      assert.deepEqual(
        ["HEAD", "refs/remotes/origin/master"],
        (
          await t.repo.refs
            .listAllRefs()
            .then((refs) => refs.map((ref) => ref.path))
        ).sort()
      );
    });

    it("retrieves all the commits from the remote's history", async () => {
      await t.kitCmd("fetch");

      assert.deepEqual(
        await commits(remote.repo, ["master"]),
        await commits(t.repo, ["origin/master"])
      );
    });
  });
});
