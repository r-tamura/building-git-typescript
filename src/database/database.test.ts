import * as path from "path";
import * as assert from "power-assert";
import { constants } from "fs";
import { Blob } from "./blob";
import { defaultFs, defaultZlib } from "../services";
import { Z_BEST_SPEED } from "zlib";
import { Database, Environment } from "./database";
import { mockFsError } from "../__test__";

type EnvMocker = {
  file?: string | Buffer;
  zlib?: string | Buffer;
  direntries?: string[] | ((...args: any) => any);
};

const mockEnv = ({
  file,
  direntries = [],
  zlib,
}: EnvMocker = {}): Environment => {
  return {
    fs: {
      ...defaultFs,
      read: jest.fn(),
      readdir: Array.isArray(direntries)
        ? jest.fn().mockResolvedValue(direntries)
        : jest.fn().mockImplementation(direntries),
      readFile: jest.fn().mockResolvedValue(file),
      stat: jest.fn(),
    },
    rand: {
      sample: jest.fn().mockReturnValue("0"),
    },
    zlib: {
      deflate: jest.fn().mockResolvedValue(zlib),
      inflate: jest.fn().mockResolvedValue(zlib),
    },
  };
};

describe("Database#hashObject", () => {
  it("GitオブジェクトのSH1ハッシュを生成する", () => {
    // Arrange
    const blob = new Blob("test content");
    const db = new Database(".git/objects", mockEnv());
    const actual = db.hashObject(blob);

    // Assert
    assert.equal(actual, "08cf6101416f0ce0dda3c80e627f333854c4085c");
  });
});

describe("Database#prefixMatch", () => {
  it("該当するオブジェクトが存在しないとき、空配列を返す", async () => {
    // Arrange
    const env = mockEnv({ direntries: mockFsError("ENOENT") });

    // Act
    const db = new Database(".git", env);
    const actual = await db.prefixMatch("08cf61");

    // Assert
    assert.deepEqual(actual, []);
  });

  it("該当するオブジェクトが1つ以上存在するとき、オブジェクトIDのリストを返す", async () => {
    // Arrange
    const env = mockEnv({
      direntries: [
        "cf6101416f0ce0dda3c80e627f333854caaaaa",
        "cf6101416f0ce0dda3c80e627f333854c4085c",
      ],
    });

    // Act
    const db = new Database(".git", env);
    const actual = await db.prefixMatch("08cf61");

    // Assert
    assert.deepEqual(actual, [
      "08cf6101416f0ce0dda3c80e627f333854caaaaa",
      "08cf6101416f0ce0dda3c80e627f333854c4085c",
    ]);
  });
});

describe("Database#readObject", () => {
  it("オブジェクトIDのオブジェクトを読み込む", async () => {
    // Arrange
    const testObject = "blob 12\0hello world";
    // Act
    const db = new Database(
      ".git/objects",
      mockEnv({ zlib: Buffer.from(testObject) })
    );
    const actual = await db.readObject(
      "08cf6101416f0ce0dda3c80e627f333854c4085c"
    );

    // Assert
    const blob = new Blob("hello world");
    blob.oid = "08cf6101416f0ce0dda3c80e627f333854c4085c";
    assert.equal(actual.toString(), blob.toString());
  });
});

describe("Database#shortOid", () => {
  it("オブジェクトIDの先頭7文字を返す", () => {
    // Act
    const db = new Database(".git/objects", mockEnv());
    const actual = db.shortOid("08cf6101416f0ce0dda3c80e627f333854c4085c");

    // Assert
    assert.equal(actual, "08cf610");
  });
});

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
      await db.store(blob);
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
  const content = Buffer.from(`blob 13\0Hello, World!`, "binary");
  const tempPath = "ab/tmp_obj_AAAAAA";
  const compressed = Buffer.from([1, 2, 3]);
  const mockedOpen = jest.fn().mockResolvedValue({ close: () => null });
  const mockedDeflate = jest.fn().mockResolvedValue(compressed);
  const mockedWrite = jest.fn();
  const mockedRename = jest.fn();
  const mockedSample = jest.fn().mockReturnValue("A");
  const errNoEntry = {
    code: "ENOENT",
  };
  describe("objects内にすでにディレクトリが存在するとき、そのディレクトリ内にオブジェクトを作成する", () => {
    beforeAll(jest.clearAllMocks);
    beforeAll(async () => {
      // Arrange
      const fs = {
        ...defaultFs,
        open: mockedOpen,
        writeFile: mockedWrite,
        rename: mockedRename,
      };
      const rand = {
        sample: mockedSample,
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
      assert.deepStrictEqual(call[0], content, "圧縮対象データ");
      assert.deepStrictEqual(
        call[1],
        { level: Z_BEST_SPEED },
        "圧縮オプション"
      );
    });

    it("writeFile", () => {
      const firstCall = mockedWrite.mock.calls[0];
      assert.deepEqual(firstCall[1], compressed, "圧縮されたデータ");
    });

    it("rename", () => {
      assert.deepEqual(mockedRename.mock.calls[0], [
        path.join(testRepoPath, tempPath),
        path.join(testRepoPath, "ab/cdefghijklmnopqrstu012345"),
      ]);
    });
  });

  describe("objects内にディレクトリが存在しないとき、ディレクトリを作成してからオブジェクトを作成する", () => {
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
        mkdir: mockedMkdir,
      };
      const rand = {
        sample: mockedSample,
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
        path.join(testRepoPath, "ab/cdefghijklmnopqrstu012345"),
      ]);
    });
  });
});
