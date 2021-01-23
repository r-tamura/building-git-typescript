import * as fsCb from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import * as assert from "power-assert";
import { Repository } from "../../src/repository";
import * as revlist from "../../src/rev_list";
import * as FileService from "../../src/services/FileService";
import { OID } from "../../src/types";
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
    await remoteRepo.kitCmd("config", "receive.denyDeleteCurrent", "false");
    return remoteRepo;
  }

  async function writeCommit(message: string) {
    await t.writeFile(`${message}.txt`, message);
    await t.kitCmd("add", ".");
    await t.commit(message);
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

  async function assertRefs(repo: Repository, refs: string[]) {
    assert.deepEqual(
      refs,
      (
        await repo.refs
          .listAllRefs()
          .then((refs) => refs.map((ref) => ref.path))
      ).sort()
    );
  }

  async function assertWorkspace(contents: T.Contents) {
    await remote.assertWorkspace(contents);
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
        "remote.origin.uploadpack",
        `${kitPath()} upload-pack`
      );
    });

    afterEach(async () => {
      await FileService.rmrf(fs, remote.repoPath);
    });

    it("displays a new branch being pushed", async () => {
      await t.kitCmd("push", "origin", "master");
      t.assertStatus(0);
      t.assertError(stripIndent`
      To file://${remote.repoPath}
      * [new branch] master -> master
      `);
    });

    it("maps the local's head to the remote's", async () => {
      await t.kitCmd("push", "origin", "master");
      assert.equal(
        await t.repo.refs.readRef("refs/heads/master"),
        await remote.repo.refs.readRef("refs/heads/master")
      );
    });

    it("maps the local's head to a different remote ref", async () => {
      await t.kitCmd("push", "origin", "master:refs/heads/other");
      assert.equal(
        await t.repo.refs.readRef("refs/heads/master"),
        await remote.repo.refs.readRef("refs/heads/other")
      );
    });

    it("does not create any other remote refs", async () => {
      await t.kitCmd("push", "origin", "master");
      await assertRefs(remote.repo, ["HEAD", "refs/heads/master"]);
    });

    it("sends all the commits from the local's history", async () => {
      await t.kitCmd("push", "origin", "master");

      assert.deepEqual(
        await commits(t.repo, ["master"]),
        await commits(remote.repo, ["master"])
      );
    });

    it("sends enough information to check out the local's commits", async () => {
      await t.kitCmd("push", "origin", "master");
      await remote.kitCmd("reset", "--hard");
      await remote.kitCmd("checkout", "master^");

      await assertWorkspace([
        ["dir/two.txt", "dir/two"],
        ["one.txt", "one"],
      ]);

      await remote.kitCmd("checkout", "master");
      await assertWorkspace([
        ["dir/two.txt", "dir/two"],
        ["one.txt", "one"],
        ["three.txt", "three"],
      ]);

      await remote.kitCmd("checkout", "master^^");
      await assertWorkspace([["one.txt", "one"]]);
    });

    it("pushes an ancestor of the current HEAD", async () => {
      await t.kitCmd("push", "origin", "@~1:master");

      t.assertError(stripIndent`
      To file://${remote.repoPath}
    \  * [new branch] @~1 -> master
      `);

      assert.deepEqual(
        await commits(t.repo, ["master^"]),
        await commits(remote.repo, ["master"])
      );
    });

    describe("after a successful push", () => {
      beforeEach(async () => {
        await t.kitCmd("push", "origin", "master");
      });

      it("says everything is up to date", async () => {
        await t.kitCmd("push", "origin", "master");
        t.assertStatus(0);

        t.assertError("Everything up-to-date");

        await assertRefs(remote.repo, ["HEAD", "refs/heads/master"]);

        assert.equal(
          await t.repo.refs.readRef("refs/heads/master"),
          await remote.repo.refs.readRef("refs/heads/master")
        );
      });

      it("deletes a remote branch by refspec", async () => {
        await t.kitCmd("push", "origin", ":master");
        // t.assertStatus(0);

        t.assertError(stripIndent`
        To file://${remote.repoPath}
      \  - [deleted] master
        `);

        await assertRefs(t.repo, ["HEAD", "refs/heads/master"]);
        await assertRefs(remote.repo, ["HEAD"]);
      });
    });

    describe("when the local ref is ahead of its remote counterpart", () => {
      let localHead: OID;
      let remoteHead: OID;
      beforeEach(async () => {
        await t.kitCmd("push", "origin", "master");
        await t.writeFile("one.txt", "changed");
        await t.kitCmd("add", ".");
        await t.commit("changed");

        localHead = (await commits(t.repo, ["master"]))[0];
        remoteHead = (await commits(remote.repo, ["master"]))[0];
      });

      it("displays a fast-forward on the changed branch", async () => {
        await t.kitCmd("push", "origin", "master");
        t.assertStatus(0);

        t.assertError(stripIndent`
        To file://${remote.repoPath}
        \  ${remoteHead}..${localHead} master -> master
        `);
      });

      it("succeeds when the remote denies non-fast-forward chenges", async () => {
        // Arrange
        await remote.kitCmd("config", "receive.denyNonFastForwards", "true");

        // Act
        await t.kitCmd("push", "origin", "master");

        // Assert
        t.assertStatus(0);
        t.assertError(stripIndent`
        To file://${remote.repoPath}
        \  ${remoteHead}..${localHead} master -> master
        `);
      });
    });

    describe("when the remote ref has diverged from its local counterpart", () => {
      let localHead: OID;
      let remoteHead: OID;
      beforeEach(async () => {
        await t.kitCmd("push", "origin", "master");
        await remote.writeFile("one.txt", "changed");
        await remote.kitCmd("add", ".");
        remote.setTime(new Date());
        await remote.kitCmd("commit", "--amend");

        localHead = (await commits(t.repo, ["master"]))[0];
        remoteHead = (await commits(remote.repo, ["master"]))[0];
      });

      it("displays a forced update if requested", async () => {
        await t.kitCmd("push", "origin", "master", "-f");
        t.assertStatus(0);

        t.assertError(stripIndent`
        To file://${remote.repoPath}
      \  + ${remoteHead}...${localHead} master -> master (forced update)
        `);
      });

      it("updates the local remotes/origin/* ref", async () => {
        await t.kitCmd("push", "origin", "master", "-f");
        assert.equal(localHead, (await commits(t.repo, ["origin/master"]))[0]);
      });

      it("deletes a remote branch by refspec", async () => {
        await t.kitCmd("push", "origin", ":master");
        t.assertStatus(0);

        t.assertError(stripIndent`
        To file://${remote.repoPath}
      \  - [deleted] master
        `);

        await assertRefs(t.repo, ["HEAD", "refs/heads/master"]);
        await assertRefs(remote.repo, ["HEAD"]);
      });

      describe("if a push is not forced", () => {
        beforeEach(async () => {
          await t.kitCmd("push", "origin", "master");
        });

        it("exits with an error", () => {
          t.assertStatus(1);
        });

        it("tells the user to fetch before pushing", async () => {
          t.assertError(stripIndent`
          To file://${remote.repoPath}
        \  ! [rejected] master -> master (fetch first)
          `);
        });

        it("display a rejection after fetching", async () => {
          await t.kitCmd("fetch");
          //   await t.kitCmd("push", "origin", "master");
          //   t.assertError(stripIndent`
          //   To file://${remote.repoPath}
          // \  ! [rejected] master -> master (non-fast-forward)
          //   `);
        });

        it("does not update the local remotes/origin/* ref", async () => {
          assert.notEqual(remoteHead, localHead);
          assert.equal(
            localHead,
            (await commits(t.repo, ["origin/master"]))[0]
          );
        });
      });

      describe("when the remote denies non-fast-forward updates", () => {
        beforeEach(async () => {
          await remote.kitCmd("config", "receive.denyNonFastForwards", "true");
          await t.kitCmd("fetch");
        });

        it("rejects the pushed update", async () => {
          await t.kitCmd("push", "origin", "master", "-f");
          t.assertStatus(1);

          t.assertError(stripIndent`
          To file://${remote.repoPath}
        \  ! [rejected] master -> master (non-fast-forward)
          `);
        });
      });
    });

    describe("when the remote denies updating the current branch", () => {
      beforeEach(async () => {
        await remote.kitCmd("config", "--unset", "receive.denyCurrentBranch");
      });

      it("rejects the pushed update", async () => {
        await t.kitCmd("push", "origin", "master");
        t.assertStatus(1);

        t.assertError(stripIndent`
        To file://${remote.repoPath}
      \  ! [rejected] master -> master (branch is currently checked out)
        `);
      });

      it("does not update the remote's ref", async () => {
        await t.kitCmd("push", "origin", "master");

        assert.notEqual(await t.repo.refs.readRef("refs/heads/master"), null);
        assert.equal(await remote.repo.refs.readRef("refs/heads/master"), null);
      });

      it("does not update the local remotes/origin/* ref", async () => {
        await t.kitCmd("push", "origin", "master");

        assert.equal(
          await t.repo.refs.readRef("refs/remotes/origin/master"),
          null
        );
      });
    });

    describe("when the remote denies deleting the current branch", () => {
      beforeEach(async () => {
        await t.kitCmd("push", "origin", "master");
        await remote.kitCmd("config", "--unset", "receive.denyDeleteCurrent");
      });

      it("rejects the pushed update", async () => {
        await t.kitCmd("push", "origin", ":master");
        t.assertStatus(1);

        t.assertError(stripIndent`
        To file://${remote.repoPath}
      \  ! [rejected] master (deletion of the current branch prohibited)
        `);
      });

      it("does not update the remote's ref", async () => {
        await t.kitCmd("push", "origin", ":master");

        assert.notEqual(await t.repo.refs.readRef("refs/heads/master"), null);
      });

      it("does not update the local remotes/origin/* ref", async () => {
        await t.kitCmd("push", "origin", "master");

        assert.notEqual(
          await t.repo.refs.readRef("refs/remotes/origin/master"),
          null
        );
      });
    });

    describe("when the remote denies deleting any branch", () => {
      beforeEach(async () => {
        await t.kitCmd("push", "origin", "master");
        await remote.kitCmd("config", "receive.denyDeletes", "true");
      });

      it("rejects the pushed update", async () => {
        await t.kitCmd("push", "origin", ":master");
        t.assertStatus(1);

        t.assertError(stripIndent`
        To file://${remote.repoPath}
      \  ! [rejected] master (deletion prohibited)
        `);
      });

      it("does not update the remote's ref", async () => {
        await t.kitCmd("push", "origin", ":master");

        assert.notEqual(await t.repo.refs.readRef("refs/heads/master"), null);
      });

      it("does not update the local remotes/origin/* ref", async () => {
        await t.kitCmd("push", "origin", ":master");

        assert.notEqual(
          await t.repo.refs.readRef("refs/remotes/origin/master"),
          null
        );
      });
    });
  });

  describe.skip("with a configured upstream branch", () => {
    beforeEach(async () => {
      remote = await createRemoteRepo("push-remote");

      await t.kitCmd("remote", "add", "origin", `file://${remote.repoPath}`);
      await t.kitCmd(
        "config",
        "remote.origin.receivepack",
        `${kitPath()} receive-pack`
      );

      for (const msg of ["one", "dir/two"]) {
        await writeCommit(msg);
      }
      await t.kitCmd("push", "origin", "master");
      await writeCommit("three");

      await t.kitCmd("branch", "--set-upstream-to", "origin/master");
    });

    afterEach(async () => {
      await FileService.rmrf(fs, remote.repoPath);
    });

    it("pushes the current branch to its upstream", async () => {
      await t.kitCmd("push");
      t.assertStatus(0);

      const [newOid, oldOid] = await commits(t.repo, ["master"]);
      t.assertError(stripIndent`
      To file://${remote.repoPath}
    \    ${oldOid}..${newOid} master -> master
      `);
    });
  });
});
