import * as assert from "power-assert";
import * as path from "path";
import * as crypto from "crypto";
import { Index } from "./gindex";
import { Lockfile } from "../lockfile";
import { defaultFs } from "../services";
import { makeTestStats, EEXIST } from "../__test__";
import { Stats, promises } from "fs";
import { createFakeRead } from "./__test__/fakeIndex";
import { LockDenied } from "../refs";
import { Entry } from "./entry";

jest.mock("../lockfile");
const testIndexPath = ".git/index";

const mockedWrite = jest.fn();
const MockedLockfile = (Lockfile as unknown) as jest.Mock<Partial<Lockfile>>;
const testObjectPath = "README.md";
const testOid = "ba78afac62556e840341715936909cc36fe83a77"; // sha1 of 'jit'

// book
describe("Index#add", () => {
  // Arrange
  const tmpPath = path.resolve("../tmp", __filename);
  const indexPath = path.join(tmpPath, "index");

  const stat = makeTestStats();
  const oid = crypto.randomBytes(20).toString("hex");
  const extractName = (e: Entry) => e.name;

  it("adds a single file", () => {
    // Act
    const index = new Index(testIndexPath);
    index.add("alice.txt", oid, stat);

    // Assert
    assert.deepEqual(index.eachEntry().map(extractName), ["alice.txt"]);
  });

  it("replaces a file with a directory", () => {
    // Act
    const index = new Index(testIndexPath);
    index.add("alice.txt", oid, stat);
    index.add("bob.txt", oid, stat);

    index.add("alice.txt/nested.txt", oid, stat);

    // Assert
    assert.deepEqual(index.eachEntry().map(extractName), [
      "alice.txt/nested.txt",
      "bob.txt",
    ]);
  });

  it("replaces a directory with a file", () => {
    // Act
    const index = new Index(testIndexPath);
    index.add("alice.txt", oid, stat);
    index.add("nested/bob.txt", oid, stat);
    index.add("nested", oid, stat);

    // Assert
    assert.deepEqual(index.eachEntry().map(extractName), [
      "alice.txt",
      "nested",
    ]);
  });

  it("recursively replaces a directory with a file", () => {
    // Act
    const index = new Index(testIndexPath);
    index.add("alice.txt", oid, stat);
    index.add("nested/bob.txt", oid, stat);
    index.add("nested/inner/claire.txt", oid, stat);

    index.add("nested", oid, stat);
    assert.deepEqual(index.eachEntry().map(extractName), [
      "alice.txt",
      "nested",
    ]);
  });
});

describe("Index#writeUpdates", () => {
  describe("indexに変更があるとき、indexへ全てのエントリを書き込む", () => {
    // Arrange
    let actual: boolean;
    const mockedWrite = jest.fn();
    beforeAll(async () => {
      MockedLockfile.mockReset();
      MockedLockfile.mockImplementation(() => ({
        write: mockedWrite,
        commit: jest.fn(),
      }));
      // Act
      const index = new Index(testObjectPath);
      index.add(testObjectPath, testOid, makeTestStats());
      actual = await index.writeUpdates();
    });

    // Assert
    it("ヘッダの書き込み", () => {
      assert.deepStrictEqual(
        Buffer.from(mockedWrite.mock.calls[0][0], "binary"),
        Buffer.from([
          0x44,
          0x49,
          0x52,
          0x43, // DIRC
          0x00,
          0x00,
          0x00,
          0x02, // version
          0x00,
          0x00,
          0x00,
          0x01, // number of entries
        ])
      );
    });

    it("オブジェクトの書き込み(Oidのみ)", () => {
      const arg = mockedWrite.mock.calls[1][0];
      const actualData = Buffer.from(arg, "binary");

      assert.equal(actualData.length, 72, "データ長");
      const actualOid = actualData.slice(40, 60).toString("hex");
      assert.equal(actualOid, testOid, "oid");
    });

    it("フッタの書き込み", () => {
      const actualSha1 = mockedWrite.mock.calls[2][0];
      assert.deepEqual(
        Buffer.from(actualSha1, "binary"),
        Buffer.from("5731b15defefca2d8429d179e2650f99f4bccdbd", "hex")
      );
    });

    it("返り値", () => {
      assert.equal(actual, true);
    });
  });

  describe("indexに変更がない場合、indexの更新を行わない", () => {
    // Arrange
    const mockedRollback = jest.fn().mockResolvedValue(undefined);
    const mockedWrite = jest.fn().mockResolvedValue(undefined);

    beforeAll(async () => {
      MockedLockfile.mockReset();
      MockedLockfile.mockImplementation(() => ({
        write: mockedWrite,
        rollback: mockedRollback,
      }));
      // Act
      const index = new Index(testIndexPath);
      await index.writeUpdates();
    });

    it("lockfileをロールバックする", () => {
      assert.equal(mockedRollback.mock.calls.length, 1);
    });

    it("ファイルの更新は実行されない", () => {
      assert.equal(mockedWrite.mock.calls.length, 0);
    });
  });

  describe("複数ファイルのとき、ファイルパスでソートされた順番で書き込む", () => {
    // Arrange
    const mockedWrite = jest.fn();
    beforeAll(async () => {
      MockedLockfile.mockReset();
      MockedLockfile.mockImplementation(() => ({
        write: mockedWrite,
        holdForUpdate: jest.fn().mockResolvedValue(true),
        commit: jest.fn(),
      }));

      // Act
      const index = new Index(testIndexPath);
      const entries = [
        [
          "bin/jit",
          "1eeef788efe4e91fe5780a77679444772f5b9253",
          makeTestStats({ ino: 8641899915, mode: 33261 }),
        ],
        [
          ".gitignore",
          "81876f206950dc4d9c0f7d20aa43fe68ee8f9113",
          makeTestStats({
            ctimeMs: 1586222433163.7546,
            mtimeMs: 1586222433163.7546,
            ino: 8641636618,
          }),
        ],

        [
          "README.md",
          "78e6cf75f4a8afa5a46741523101393381913dd4",
          makeTestStats(),
        ],
      ] as [string, string, Stats][];
      entries.forEach((e) => index.add(...e));
      await index.writeUpdates();
    });

    // headerの書き込みがあるためインデックス0はスキップ
    it.each([
      [".gitignore", 1, "81876f206950dc4d9c0f7d20aa43fe68ee8f9113"],
      ["README.md", 2, "78e6cf75f4a8afa5a46741523101393381913dd4"],
      ["bin/jit", 3, "1eeef788efe4e91fe5780a77679444772f5b9253"],
    ])("%s", (expectedName, index, expectedHash) => {
      const arg = mockedWrite.mock.calls[index][0];
      const buf = Buffer.from(arg);
      assert.equal(buf.slice(40, 60).toString("hex"), expectedHash);
    });
  });
});

describe("loadForUpdate", () => {
  // Arrange
  const mockedRead = jest
    .fn<
      ReturnType<promises.FileHandle["read"]>,
      Parameters<promises.FileHandle["read"]>
    >()
    .mockImplementation(createFakeRead());
  const mockedOpen = jest
    .fn<Promise<Partial<promises.FileHandle>>, any>()
    .mockResolvedValue({
      read: mockedRead as any,
      close: jest.fn(),
    });
  const env = {
    fs: { ...defaultFs, open: mockedOpen as any },
  };
  describe("lockfileがロックされているとき、ファイルが読み込まれない", () => {
    const throwLockDenied = () => {
      throw new LockDenied();
    };
    beforeAll(async () => {
      MockedLockfile.mockReset();
      MockedLockfile.mockImplementation(() => ({
        write: jest.fn(),
        holdForUpdate: jest.fn().mockImplementation(throwLockDenied),
        commit: jest.fn(),
      }));

      // Act
      const index = new Index(testIndexPath, env);
      const actual = index.loadForUpdate();

      // Assert
      await expect(actual).rejects.toThrow(LockDenied);
    });

    it("indexファイルの読み込み", () => {
      expect(mockedOpen).not.toBeCalled();
    });
  });

  describe("lockfileがロックされていないとき、indexファイルからデータを読み込みtrueを返す", () => {
    let actual: boolean;
    beforeAll(async () => {
      // Arrange
      jest.clearAllMocks();
      MockedLockfile.mockReset();
      MockedLockfile.mockImplementation(() => ({
        write: mockedWrite,
        holdForUpdate: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn(),
      }));

      // Act
      const index = new Index(testIndexPath, env);
      await index.loadForUpdate();
      index.add(testObjectPath, testOid, makeTestStats());
      await index.writeUpdates();
    });

    it("indexファイルの読み込み", () => {
      assert.equal(mockedOpen.mock.calls.length, 1, "indexファイルオープン");

      assert.equal(
        mockedRead.mock.calls.length,
        6,
        "header + (file meta + file name)x2 + checksum"
      );
    });
    it("データが読み込まれる", () => {
      assert.equal(
        mockedWrite.mock.calls.length,
        5,
        "header + indexファイルのデータx2 + 追加データx1 + checksum"
      );
    });
  });
});
