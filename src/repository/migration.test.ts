import type { Mock, MockInstance } from "vitest";
import { constants } from "fs";
import assert from "node:assert";
import { makeDummyFileStats } from "../__test__";
import { setOid } from "../__test__/util";
import { Blob, ChangeMap, Entry } from "../database";
import * as Index from "../gindex";
import * as FileService from "../services/FileService";
import { Dict } from "../types";
import { posixPath } from "../util/fs";
import { Migration } from "./migration";
import { Repository } from "./repository";

describe("Migration#applyChanges", () => {
  let spyRmrf: MockInstance<any>;
  beforeAll(() => {
    spyRmrf = vi.spyOn(FileService, "rmrf").mockResolvedValue(undefined);
  });

  describe("削除されるエントリがあるとき、そのエントリを削除する", () => {
    const rmdir = vi.fn().mockResolvedValue(undefined);
    const unlink = vi.fn().mockResolvedValue(undefined);
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const chmod = vi.fn().mockResolvedValue(undefined);

    const testStat = makeDummyFileStats();
    const env = {
      fs: {
        rmdir,
        unlink,
        mkdir,
        writeFile,
        chmod,
        stat: vi.fn().mockResolvedValue(testStat),
      },
    };
    let remove: MockInstance<any>;
    let add: MockInstance<any>;

    // mocked index
    // prettier-ignore
    const index: Dict<Index.Entry | null> = {
      [posixPath("del/ete/deleted.txt")]: null,
      [posixPath("added.txt")]:           Index.Entry.create(posixPath("added.txt"), "abcdef1", testStat),
      [posixPath("dir/updated.txt")]:     Index.Entry.create(posixPath("dir/updated.txt"), "abcdef4", testStat)
    }
    const mockedEntryForPath = (p: string) => index[p];
    const diff: ChangeMap = new Map([
      // 削除されるファイル
      [posixPath("del/ete/deleted.txt"), [new Entry("abcdef0", 0o0100644), null]],
      // 追加されるファイル
      [posixPath("added.txt"), [null, new Entry("abcdef1", 0o0100644)]],
      // 更新されるファイル
      // prettier-ignore
      [posixPath("dir/updated.txt"), [new Entry("abcdef3", 0o0100644), new Entry("abcdef4", 0o0100644)]],
    ]);

    beforeAll(async () => {
      // Arrange
      const repo = new Repository("/tmp/.git", env as any);
      // prettier-ignore
      vi.spyOn(repo.database, "load").mockResolvedValue(setOid(new Blob("hello")));
      remove = vi.spyOn(repo.index, "remove").mockResolvedValue(undefined);
      add = vi.spyOn(repo.index, "add");
      vi
        .spyOn(repo.index, "entryForPath")
        .mockImplementation(mockedEntryForPath);

      // Act
      const mgr = new Migration(repo, diff);
      await mgr.applyChanges();
    });
    afterAll(() => {
      vi.resetAllMocks();
    });

    // Assert
    describe("Workspace", () => {
      it("ファイルが削除される", () => {
        // OS依存パスでOK
        assert.equal(spyRmrf.mock.calls[0][1], "/tmp/del/ete/deleted.txt");
      });

      it("子ディレクトリから順に空ディレクトリが削除される", () => {
        // OS依存パスでOK
        assert.deepEqual(rmdir.mock.calls, [["/tmp/del/ete"], ["/tmp/del"]]);
      });

      it("ディレクトリが作成される", () => {
        // OS依存パスでOK
        assert.equal(mkdir.mock.calls[0][0], "/tmp/dir");
      });

      it("ファイルが更新される", () => {
        const flag =
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL;
        // OS依存パスでOK
        assert.deepEqual(writeFile.mock.calls[0], [
          "/tmp/dir/updated.txt",
          "hello",
          { flag },
        ]);
      });

      it("ファイルが作成される", () => {
        const flag =
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL;
        // OS依存パスでOK
        assert.deepEqual(writeFile.mock.calls[1], [
          "/tmp/added.txt",
          "hello",
          { flag },
        ]);
      });
    });

    describe("Index", () => {
      it("ファイルが削除される", () => {
        assert.equal(remove.mock.calls[0][0], posixPath("del/ete/deleted.txt"));
      });

      it("ファイルが追加される", () => {
        assert.deepEqual(add.mock.calls, [
          [posixPath("added.txt"), "abcdef1", testStat],
          [posixPath("dir/updated.txt"), "abcdef4", testStat],
        ]);
      });
    });
  });
});
