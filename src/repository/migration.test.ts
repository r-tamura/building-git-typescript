import * as assert from "power-assert";
import * as FileService from "../services/FileService";
import { Repository } from "./repository";
import { Migration } from "./migration";
import * as Index from "../gindex";
import { Entry, Changes, Blob } from "../database";
import { makeTestStats } from "../__test__";
import { setOid } from "../__test__/util";
import { Dict } from "../types";

describe("Migration#applyChanges", () => {
  let spyRmrf: jest.SpyInstance;
  beforeAll(() => {
    spyRmrf = jest.spyOn(FileService, "rmrf").mockResolvedValue(undefined);
  });

  describe("削除されるエントリがあるとき、そのエントリを削除する", () => {
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

    // mocked index
    // prettier-ignore
    const index: Dict<Index.Entry | null> = {
      "del/ete/deleted.txt": null,
      "added.txt":           Index.Entry.create("added.txt", "abcdef1", testStat),
      "dir/updated.txt":     Index.Entry.create("dir/updated.txt", "abcdef4", testStat)
    }
    const mockedEntryForPath = (p: string) => index[p];
    const diff: Changes = new Map([
      // 削除されるファイル
      ["del/ete/deleted.txt", [new Entry("abcdef0", 0o0100644), null]],
      // 追加されるファイル
      ["added.txt", [null, new Entry("abcdef1", 0o0100644)]],
      // 更新されるファイル
      // prettier-ignore
      ["dir/updated.txt", [new Entry("abcdef3", 0o0100644), new Entry("abcdef4", 0o0100644)]],
    ]);

    beforeAll(async () => {
      // Arrange
      const repo = new Repository("/tmp/.git", env as any);
      // prettier-ignore
      jest.spyOn(repo.database, "load").mockResolvedValue(setOid(new Blob("hello")));
      remove = jest.spyOn(repo.index, "remove").mockResolvedValue(undefined);
      add = jest.spyOn(repo.index, "add");
      jest
        .spyOn(repo.index, "entryForPath")
        .mockImplementation(mockedEntryForPath);

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
