import * as crypto from "crypto";
import { promises as fsPromises } from "fs";
import * as path from "path";
import * as assert from "power-assert";
import { makeDummyFileStats } from "../__test__";
import * as Database from "../database";
import { LockDenied } from "../refs";
import { posixPath } from "../util/fs";
import { fakeIndex } from "./__test__/fakeIndex";
import { Entry } from "./entry";
import { Index } from "./gindex";

import mock = require("mock-fs");

const mockedWrite = jest.fn();
const TEST_OBJECT_PATH = "README.md";
const testOid = "ba78afac62556e840341715936909cc36fe83a77"; // sha1 of 'jit\n'

const randOid = () =>
  crypto.createHash("sha1").update(Math.random().toString()).digest("hex");

afterEach(() => {
  mock.restore();
});

// book
describe("Index#add", () => {
  // Arrange
  const tmpPath = path.resolve("../tmp", __filename);
  const indexPath = path.posix.join(tmpPath, "index");

  const stat = makeDummyFileStats();
  const oid = crypto.randomBytes(20).toString("hex");
  const extractName = (e: Entry) => e.name;

  it("adds a single file", () => {
    // Act
    const index = new Index(posixPath("./git/index"));
    index.add(posixPath("alice.txt"), oid, stat);

    // Assert
    assert.deepEqual(index.eachEntry().map(extractName), ["alice.txt"]);
  });

  it("replaces a file with a directory", () => {
    // Act
    const index = new Index(posixPath("./git/index"));
    index.add(posixPath("alice.txt"), oid, stat);
    index.add(posixPath("bob.txt"), oid, stat);

    index.add(posixPath("alice.txt/nested.txt"), oid, stat);

    // Assert
    assert.deepEqual(index.eachEntry().map(extractName), [
      "alice.txt/nested.txt",
      "bob.txt",
    ]);
  });

  it("replaces a directory with a file", () => {
    // Act
    const index = new Index(posixPath("./git/index"));
    index.add(posixPath("alice.txt"), oid, stat);
    index.add(posixPath("nested/bob.txt"), oid, stat);
    index.add(posixPath("nested"), oid, stat);

    // Assert
    assert.deepEqual(index.eachEntry().map(extractName), [
      "alice.txt",
      "nested",
    ]);
  });

  it("recursively replaces a directory with a file", () => {
    // Arrange
    const index = new Index(posixPath("./git/index"));
    index.add(posixPath("alice.txt"), oid, stat);
    index.add(posixPath("nested/bob.txt"), oid, stat);
    index.add(posixPath("nested/inner/claire.txt"), oid, stat);

    // Act
    index.add(posixPath("nested"), oid, stat);

    // Assert
    assert.deepEqual(index.eachEntry().map(extractName), [
      "alice.txt",
      "nested",
    ]);
  });
});

describe("Index#remove", () => {
  it("インデックスから削除される", async () => {
    // Arrange
    const index = new Index(posixPath(".git"));
    index.add(posixPath("path/to/some/a.txt"), "abcdef1", makeDummyFileStats());
    assert.equal(index.tracked(posixPath("path/to/some/a.txt")), true);

    // Act
    await index.remove(posixPath("path/to/some/a.txt"));

    // Assert
    assert.equal(index.tracked(posixPath("path/to/some/a.txt")), false);
  });
});

describe("Index#writeUpdates", () => {
  describe("indexに変更があるとき、indexへ全てのエントリを書き込む", () => {
    // Arrange
    let actual: boolean;

    // Assert
    it("1ファイルをIndexファイルへ書き込むことができる", async () => {
      // Arrange
      // mockした後にconsoleを使うのを禁止
      // jestが適用したconsoleのラッパーが動かなくなる
      mock({
        "file.txt": mock.file({
          content: "", // ファイル内容は空
          mtime: new Date(1586584079000),
          ctime: new Date(1586584079000),
          mode: 0o100644,
          uid: 501,
          gid: 20,
        }),
      });

      // Act
      const index = new Index(posixPath("index"));
      await index.loadForUpdate();
      index.add(
        posixPath("file.txt"),
        testOid,
        await fsPromises.stat("file.txt"),
      );
      actual = await index.writeUpdates();

      const actualIndexString = await fsPromises.readFile("index", "binary");
      const actualIndex = Buffer.from(actualIndexString, "binary");
      const dirc = Buffer.from("DIRC", "utf8");
      assert.equal(
        Uint8Array.prototype.slice.call(actualIndex, 0, 4).toString(),
        "DIRC",
        "DIRC",
      );
      const version = Buffer.from([0x00, 0x00, 0x00, 0x02]);
      assert.equal(
        Uint8Array.prototype.slice.call(actualIndex, 4, 8).toString(),
        version.toString(),
        "version",
      );
      const numberOfEntries = Buffer.from([0x00, 0x00, 0x00, 0x01]);
      assert.equal(
        Uint8Array.prototype.slice
          .call(numberOfEntries, 0, numberOfEntries.length)
          .toString(),
        numberOfEntries.toString(),
        "numberOfEntries",
      );
      const ctime = Buffer.from([
        0x5e, 0x91, 0x5a, 0x0f, 0x00, 0x00, 0x00, 0x00,
      ]);
      assert.deepEqual(
        Uint8Array.prototype.slice.call(actualIndex, 12, 20),
        ctime,
        "ctime",
      );
      const mtime = Buffer.from([
        0x5e, 0x91, 0x5a, 0x0f, 0x00, 0x00, 0x00, 0x00,
      ]);
      assert.deepEqual(
        Uint8Array.prototype.slice.call(actualIndex, 20, 28),
        mtime,
        "mtime",
      );
      // Skip 'mode', 'dev', 'ino' assertions
      // mock-fsで設定できない項目のアサーションはスキップ Entryクラスのテストで担保
      const uid = Buffer.from([0x00, 0x00, 1, 245]); // あっている?
      assert.deepEqual(
        Uint8Array.prototype.slice.call(actualIndex, 40, 44),
        uid,
        "uid",
      );
      const gid = Buffer.from([0x00, 0x00, 0x00, 20]); // あっている?
      assert.deepEqual(
        Uint8Array.prototype.slice.call(actualIndex, 44, 48),
        gid,
        "gid",
      );
      const size = Buffer.from([0x00, 0x00, 0x00, 0x00]); // あっている?
      assert.deepEqual(
        Uint8Array.prototype.slice.call(actualIndex, 48, 52),
        size,
        "size",
      );
      // prettier-ignore
      const sha1 = Buffer.from([
        0xba, 0x78, 0xaf, 0xac, 0x62, 0x55, 0x6e, 0x84, 0x03, 0x41,
        0x71, 0x59, 0x36, 0x90, 0x9c, 0xc3, 0x6f, 0xe8, 0x3a, 0x77,
      ]); // SHA-1 of 'jit\n'
      assert.deepEqual(
        Uint8Array.prototype.slice.call(actualIndex, 52, 72),
        sha1,
        "sha1",
      );
      const flags = Buffer.from([0x00, 0x08]);
      assert.deepEqual(
        Uint8Array.prototype.slice.call(actualIndex, 72, 74),
        flags,
        "flags(ファイル名の長さ:8byte + ステージ0 + その他の機能は未サポートなので0)",
      );
      assert.deepEqual(
        new TextDecoder("utf-8").decode(
          Uint8Array.prototype.slice.call(actualIndex, 74, 82),
        ),
        "file.txt",
        "name",
      );
    });
  });

  describe("indexに変更がない場合、indexの更新を行わない", () => {
    beforeEach(() => {
      mock({
        "./.git/index": mock.file({
          content: fakeIndex,
          mtime: new Date(2025, 5, 1),
        }),
      });
    });

    it("lockfileをロールバックする", async () => {
      // Act
      const index = new Index(posixPath("./.git/index"));
      await index.loadForUpdate();
      await index.writeUpdates();

      // Assert
      try {
        await fsPromises.access("./.git/index.lock");
      } catch (err: any) {
        assert.equal(err.code, "ENOENT");
      }
    }, 100000);

    it("ファイルの更新は実行されない", async () => {
      // Act
      const index = new Index(posixPath("./.git/index"));
      await index.loadForUpdate();
      await index.writeUpdates();

      // Assert
      const stats = await fsPromises.stat("./.git/index");
      assert.deepEqual(stats.mtime, new Date(2025, 5, 1));
    });
  });

  describe("複数ファイルのときのインデックスされたファイルの順序", () => {
    // Arrange
    beforeEach(async () => {
      mock({
        ".git": mock.directory(),
        "bin/jit": mock.file({
          content: "jit",
          mode: 0o100755, // 実行可能ファイル
        }),
        ".gitignore": mock.file({
          content: "*.log\nnode_modules/",
          mtime: new Date(1586222433163),
          ctime: new Date(1586222433163),
        }),
        "README.md": mock.file({
          content: "# Sample README",
        }),
      });

      // Act
      const index = new Index(posixPath("./.git/index"));
      await index.loadForUpdate();
      const entries = [
        [
          posixPath("bin/jit"),
          "1eeef788efe4e91fe5780a77679444772f5b9253",
          await fsPromises.stat("bin/jit"),
        ],
        [
          posixPath(".gitignore"),
          "81876f206950dc4d9c0f7d20aa43fe68ee8f9113",
          await fsPromises.stat(".gitignore"),
        ],
        [
          posixPath("README.md"),
          "78e6cf75f4a8afa5a46741523101393381913dd4",
          await fsPromises.stat("README.md"),
        ],
      ] as const;

      for (const [pathname, oid, stats] of entries) {
        index.add(pathname, oid, stats);
      }
      await index.writeUpdates();
    });
    it("インデックスファイルが作成され、ファイル名ソート順でエントリが含まれていること", async () => {
      // Assert
      const index = new Index(posixPath("./.git/index"));
      await index.loadForUpdate();

      const entryShaPairs = index.eachEntry().map((entry) => ({
        name: entry.name,
        hash: entry.oid,
      }));

      const expectedEntries = [
        {
          name: ".gitignore",
          hash: "81876f206950dc4d9c0f7d20aa43fe68ee8f9113",
        },
        { name: "README.md", hash: "78e6cf75f4a8afa5a46741523101393381913dd4" },
        { name: "bin/jit", hash: "1eeef788efe4e91fe5780a77679444772f5b9253" },
      ];
      assert.deepEqual(
        entryShaPairs,
        expectedEntries,
        "全てのエントリがファイル名順で正しいSHA-1ハッシュを持つこと",
      );
    });
  });
});

describe("Index#loadForUpdate", () => {
  // Arrange
  // const mockedRead = jest
  //   .fn<
  //     ReturnType<fsPromises.FileHandle["read"]>,
  //     Parameters<fsPromises.FileHandle["read"]>
  //   >()
  //   .mockImplementation(fakeFileHandleRead() as any);
  // const mockedOpen = jest
  //   .fn<Promise<Partial<fsPromises.FileHandle>>, any>()
  //   .mockResolvedValue({
  //     read: mockedRead as any,
  //     close: jest.fn(),
  //   });
  // const env = {
  //   fs: { ...defaultFs, open: mockedOpen as any },
  // };

  it("lockfileがロックされているとき、ファイルが読み込まれない", async () => {
    // Arrange
    mock({
      ".git/index.lock": mock.file({}),
    });

    // Act
    const index = new Index(posixPath(".git/index"));
    const actual = index.loadForUpdate();

    // Assert
    await expect(actual).rejects.toThrow(LockDenied);
  });
});

describe("Index#conflict", () => {
  it("ステージ0のエントリのみのとき、コンフリクト状態ではない", () => {
    // Arrange
    const env = {} as any;
    const index = new Index(posixPath(".git"), env);
    index.add(posixPath("file.txt"), testOid, makeDummyFileStats());

    // Act
    const actual = index.conflict();

    // Assert
    assert.equal(actual, false);
  });
  // prettier-ignore
  it.each([
    ["ステージ 1", new Database.Entry(randOid(), 33261), new Database.Entry(randOid(), 33261), null],
    ["ステージ 2", null, new Database.Entry(randOid(), 33261), new Database.Entry(randOid(), 33261)],
    ["ステージ 3", null, null, new Database.Entry(randOid(), 33261)],
  ])("%s のエントリを含むとき、コンフリクト状態である", (stage, base, left, right) => {
    // Arrange
    const env = {} as any;
    const index = new Index(posixPath(".git"), env);
    index.addConflictSet(posixPath("file.txt"), [base, left, right]);

    // Act
    const actual = index.conflict();

    // Assert
    assert.equal(actual, true);
  });
});
