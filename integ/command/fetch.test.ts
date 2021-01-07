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

    it("accepts short-hand refs in the fetch refspec", async () => {
      await t.kitCmd("fetch", "origin", "master:topic");

      assert.equal(
        await remote.repo.refs.readRef("refs/heads/master"),
        await t.repo.refs.readRef("refs/heads/topic")
      );
    });

    it("accepts short-hand 'head' refs in the fetch refspec", async () => {
      await t.kitCmd("fetch", "origin", "master:heads/topic");

      assert.equal(
        await remote.repo.refs.readRef("refs/heads/master"),
        await t.repo.refs.readRef("refs/heads/topic")
      );
    });

    it("accepts short-hand 'head' refs in the fetch refspec", async () => {
      await t.kitCmd("fetch", "origin", "master:remotes/topic");

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

    it("retrieves enough information to check out the remote's commits", async () => {
      // Act
      await t.kitCmd("fetch");

      // Assert
      await t.kitCmd("checkout", "origin/master^");
      await t.assertWorkspace([
        ["dir/two.txt", "dir/two"],
        ["one.txt", "one"],
      ]);

      await t.kitCmd("checkout", "origin/master");
      await t.assertWorkspace([
        ["dir/two.txt", "dir/two"],
        ["one.txt", "one"],
        ["three.txt", "three"],
      ]);

      await t.kitCmd("checkout", "origin/master^^");
      await t.assertWorkspace([["one.txt", "one"]]);
    });

    describe.skip("when an unpack limit is set", () => {
      beforeEach(async () => {
        await t.kitCmd("config", 'fetch.unpackLimit", "5');
      });

      it("keeps the pack on disk with an index", async () => {
        await t.kitCmd("fetch");
        await assertObjectCount(2);
      });

      it("can load commits from the stored pack", async () => {
        await t.kitCmd("fetch");
        assert.deepEqual(
          await commits(remote.repo, ["master"]),
          await commits(t.repo, ["origin/master"])
        );
      });
    });

    describe("when the remote ref is ahead of its local counterpart", () => {
      let localHead: string;
      let remoteHead: string;
      beforeEach(async () => {
        await t.kitCmd("fetch");

        await remote.writeFile("one.txt", "changed");
        await remote.kitCmd("add", ".");
        await remote.commit("changed");

        localHead = (await commits(t.repo, ["origin/master"]))[0];
        remoteHead = (await commits(remote.repo, ["master"]))[0];
      });

      it("displays a fast-forward on the change branch", async () => {
        await t.kitCmd("fetch");
        t.assertStatus(0);

        t.assertError(stripIndent`
        From file://${remote.repoPath}
        \  ${localHead}..${remoteHead} master -> origin/master
        `);
      });
    });

    describe("when the remote ref is diverged from its local counterpart", () => {
      let localHead: string;
      let remoteHead: string;
      beforeEach(async () => {
        await t.kitCmd("fetch");

        await remote.writeFile("one.txt", "changed");
        await remote.kitCmd("add", ".");
        await remote.kitCmd("commit", "--amend");

        localHead = (await commits(t.repo, ["origin/master"]))[0];
        remoteHead = (await commits(remote.repo, ["master"]))[0];
      });

      it("displays a forced update on the changed branch", async () => {
        await t.kitCmd("fetch");
        t.assertStatus(0);

        t.assertError(stripIndent`
        From file://${remote.repoPath}
        \+ ${localHead}...${remoteHead} master -> origin/master (forced update)
        `);
      });

      it("displays a forced update if requested", async () => {
        await t.kitCmd(
          "fetch",
          "-f",
          "origin",
          "refs/heads/*:refs/remotes/origin/*"
        );
        t.assertStatus(0);

        t.assertError(stripIndent`
        From file://${remote.repoPath}
        \+ ${localHead}...${remoteHead} master -> origin/master (forced update)
        `);
      });

      it("updates the local remotes/origin/* ref", async () => {
        await t.kitCmd("fetch");

        assert.notEqual(remoteHead, localHead);
        assert.equal(remoteHead, (await commits(t.repo, ["origin/master"]))[0]);
      });

      describe("if a fetch is not forced", () => {
        beforeEach(async () => {
          await t.kitCmd(
            "fetch",
            "origin",
            "refs/heads/*:refs/remotes/origin/*"
          );
        });

        it("exits with an error", () => {
          t.assertStatus(1);
        });

        it("displays a rejection", () => {
          t.assertError(stripIndent`
          From file://${remote.repoPath}
          \! [rejected] master -> origin/master (non-fast-forward)
          `);
        });

        it("does not update the local remotes/origin/* ref", async () => {
          assert.notEqual(remoteHead, localHead);
          assert.equal(
            localHead,
            (await commits(t.repo, ["origin/master"]))[0]
          );
        });
      });
    });
  });
});
