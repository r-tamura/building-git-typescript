import * as assert from "power-assert";
import * as Services from "../services";
import { Repository } from "./repository";
import { Migration } from "./migration";
import { Entry, Changes, Blob } from "../database";
import { makeTestStats } from "../__test__";

describe.skip("Migration#applyChanges", () => {
  describe("削除されるエントリがあるとき、そのエントリを削除する", () => {
    const spyRmrf = jest.spyOn(Services, "rmrf").mockResolvedValue(undefined);
    const rmdir = jest.fn().mockResolvedValue(undefined);
    const unlink = jest.fn().mockResolvedValue(undefined);
    const mkdir = jest.fn().mockResolvedValue(undefined);
    const writeFile = jest.fn().mockResolvedValue(undefined);
    const chmod = jest.fn().mockResolvedValue(undefined);

    const testStat = makeTestStats();
    const env = {
      fs: {
        rmdir,
        unlink,
        mkdir,
        writeFile,
        chmod,
        stat: jest.fn().mockResolvedValue(testStat),
      },
    };
    let remove: jest.SpyInstance;
    let add: jest.SpyInstance;
    beforeAll(async () => {
      // Arrange
      const repo = new Repository("/tmp/.git", env as any);
      jest.spyOn(repo.database, "load").mockResolvedValue(new Blob("hello"));
      remove = jest.spyOn(repo.index, "remove").mockResolvedValue(undefined);
      add = jest.spyOn(repo.index, "add");
      const diff: Changes = new Map([
        ["del/ete/deleted.txt", [new Entry("abcdef0", 0o0100644), null]],
        ["added.txt", [null, new Entry("abcdef1", 0o0100644)]],
        [
          "dir/updated.txt",
          [new Entry("abcdef3", 0o0100644), new Entry("abcdef4", 0o0100644)],
        ],
      ]);
      // Act
      const mgr = new Migration(repo, diff);
      await mgr.applyChanges();
    });
    afterAll(() => {
      jest.resetAllMocks();
    });

    // Assert
    describe("Workspace", () => {
      it("ファイルが削除される", () => {
        assert.equal(spyRmrf.mock.calls[0][1], "/tmp/del/ete/deleted.txt");
      });

      it("子ディレクトリから順に空ディレクトリが削除される", () => {
        assert.deepEqual(rmdir.mock.calls, [["/tmp/del/ete"], ["/tmp/del"]]);
      });

      it("ディレクトリが作成される", () => {
        assert.equal(mkdir.mock.calls[0][0], "/tmp/dir");
      });

      it("ファイルが更新される", () => {
        assert.deepEqual(writeFile.mock.calls[0], [
          "/tmp/dir/updated.txt",
          "hello",
          { flag: 2561 },
        ]);
      });

      it("ファイルが作成される", () => {
        assert.deepEqual(writeFile.mock.calls[1], [
          "/tmp/added.txt",
          "hello",
          { flag: 2561 },
        ]);
      });
    });

    describe("Index", () => {
      it("ファイルが削除される", () => {
        assert.equal(remove.mock.calls[0][0], "del/ete/deleted.txt");
      });

      it("ファイルが追加される", () => {
        assert.deepEqual(add.mock.calls, [
          ["added.txt", "abcdef1", testStat],
          ["dir/updated.txt", "abcdef4", testStat],
        ]);
      });
    });
  });
});
