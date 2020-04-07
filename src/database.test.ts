import { Database } from "./database";
import { defaultFs, defaultZlib } from "./services";
import * as assert from "power-assert";
import { constants } from "fs";
import * as path from "path";
import { Blob } from "./blob";
import { Z_BEST_SPEED } from "zlib";

describe("Database#store", () => {
  describe("blobの場合、オブジェクトタイプをblobとする", () => {
    const testRepoPath = "/test/jit";
    let db: Database;
    const mockedWriteObject = jest.fn();
    const testContent = "test content";
    beforeAll(async () => {
      // Arrange
      const blob = new Blob(testContent);
      db = new Database(testRepoPath);
      db.writeObject = mockedWriteObject;

      // Act
      db.store(blob);
    });
    // Assert
    it("オブジェクトID", () => {
      assert.equal(
        mockedWriteObject.mock.calls[0][0],
        "08cf6101416f0ce0dda3c80e627f333854c4085c"
      );
    });
    it("シリアライズされたオブジェクト", () => {
      assert.equal(mockedWriteObject.mock.calls[0][1], "blob 12\0test content");
    });
  });
});

describe("Database#writeObject", () => {
  const testRepoPath = "/test/jit";
  const oid = "abcdefghijklmnopqrstu012345";
  const content = `blob 13\0Hello, World!`;
  const tempPath = "ab/tmp_obj_AAAAAA";
  const compressed = Buffer.from([1, 2, 3]);
  const mockedOpen = jest.fn().mockResolvedValue({ close: () => null });
  const mockedDeflate = jest.fn().mockResolvedValue(compressed);
  const mockedWrite = jest.fn();
  const mockedRename = jest.fn();
  const mockedSample = jest.fn().mockReturnValue("A");
  const errNoEntry = {
    code: "ENOENT"
  };
  describe("objects内にすでにディレクトリが存在する場合、そのディレクトリ内にオブジェクトを作成する", () => {
    beforeAll(jest.clearAllMocks);
    beforeAll(async () => {
      // Arrange
      const fs = {
        ...defaultFs,
        open: mockedOpen,
        writeFile: mockedWrite,
        rename: mockedRename
      };
      const rand = {
        sample: mockedSample
      };
      const zlib = { ...defaultZlib, deflate: mockedDeflate };

      // Act
      const db = new Database(testRepoPath, { fs, rand, zlib });
      await db.writeObject(oid, content);
    });

    // Assert
    it("open", () => {
      const { O_RDWR, O_CREAT, O_EXCL } = constants;
      const firstCall = mockedOpen.mock.calls[0];
      assert.equal(
        firstCall[0],
        path.join(testRepoPath, tempPath),
        "一時ファイル名"
      );
      assert.equal(firstCall[1], O_RDWR | O_CREAT | O_EXCL, "一時ファイル名");
    });

    it("deflate", () => {
      const call = mockedDeflate.mock.calls[0];
      assert.equal(call[0], content, "圧縮対象データ");
      assert.deepEqual(call[1], { level: Z_BEST_SPEED }, "圧縮オプション");
    });

    it("writeFile", () => {
      const firstCall = mockedWrite.mock.calls[0];
      assert.deepEqual(firstCall[1], compressed);
    });

    it("rename", () => {
      assert.deepEqual(mockedRename.mock.calls[0], [
        path.join(testRepoPath, tempPath),
        path.join(testRepoPath, "ab/cdefghijklmnopqrstu012345")
      ]);
    });
  });

  describe("objects内にディレクトリが存在しない場合、ディレクトリを作成してからオブジェクトを作成する", () => {
    const mockedOpen = jest.fn().mockImplementationOnce(() => {
      throw errNoEntry;
    });
    const mockedMkdir = jest.fn();
    beforeAll(jest.clearAllMocks);
    beforeAll(async () => {
      // Arrange
      const fs = {
        ...defaultFs,
        open: mockedOpen,
        writeFile: mockedWrite,
        rename: mockedRename,
        mkdir: mockedMkdir
      };
      const rand = {
        sample: mockedSample
      };
      const zlib = { ...defaultZlib, deflate: mockedDeflate };

      // Act
      const db = new Database(testRepoPath, { fs, rand, zlib });
      await db.writeObject(oid, content);
    });

    it("mkdir", () => {
      assert.equal(mockedMkdir.mock.calls[0][0], path.join(testRepoPath, "ab"));
    });

    it("open", () => {
      assert.equal(
        mockedOpen.mock.calls.length,
        2,
        "例外発生前と後で2回呼び出される"
      );
    });

    it("deflate", () => {
      assert.equal(mockedDeflate.mock.calls[0][0], content);
    });

    it("writeFile", () => {
      const firstCall = mockedWrite.mock.calls[0];
      assert.deepEqual(firstCall[1], compressed);
    });
    it("rename", () => {
      assert.deepEqual(mockedRename.mock.calls[0], [
        path.join(testRepoPath, tempPath),
        path.join(testRepoPath, "ab/cdefghijklmnopqrstu012345")
      ]);
    });
  });
});
