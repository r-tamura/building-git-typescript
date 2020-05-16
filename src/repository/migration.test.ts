import * as assert from "power-assert";
import * as Services from "../services";
import { Repository } from "./repository";
import { Migration } from "./migration";
import { Entry, Changes, Blob } from "../database";

describe("Migration#applyChanges", () => {
  describe("削除されるエントリがあるとき、そのエントリを削除する", () => {
    const spyRmrf = jest.spyOn(Services, "rmrf").mockResolvedValue(undefined);
    const rmdir = jest.fn().mockResolvedValue(undefined);
    const unlink = jest.fn().mockResolvedValue(undefined);
    const mkdir = jest.fn().mockResolvedValue(undefined);
    const writeFile = jest.fn().mockResolvedValue("undefinddded");
    const chmod = jest.fn().mockResolvedValue(undefined);
    const env = {
      fs: {
        rmdir,
        unlink,
        mkdir,
        writeFile,
        chmod,
        stat: jest.fn().mockResolvedValue(undefined),
      },
    };
    beforeAll(async () => {
      // Arrange
      const repo = new Repository("/tmp/.git", env as any);
      jest.spyOn(repo.database, "load").mockResolvedValue(new Blob("hello"));
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
});
