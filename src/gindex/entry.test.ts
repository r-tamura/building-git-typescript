import * as path from "path";
import * as assert from "power-assert";
import { makeDummyFileStats } from "../__test__";
import { Entry } from "./entry";

const testPath = "README.md";
const testOid = "ba78afac62556e840341715936909cc36fe83a77"; // sha1 of 'jit'

const toBytes = (...numbers: (number | string)[]) => {
  const concated = numbers.join("");
  const buf = Buffer.from(concated, "hex");
  return buf;
};

describe("Entry.create", () => {
  const testPath = "test/entry.txt";
  const testOid = "ba78afac62556e840341715936909cc36fe83a77"; // sha1 of 'jit'
  describe("Git index向けのファイル情報を返す", () => {
    // Arrange
    const testStats = makeDummyFileStats();

    // Act
    const actual = Entry.create(testPath, testOid, testStats);

    // Assert
    it("ctime", () => {
      assert.equal(actual.ctime, 1586430701);
    });

    it("mtime", () => {
      assert.equal(actual.mtime, 1586430700);
    });

    it("ctime ns", () => {
      assert.equal(actual.ctimeNsec, 0);
    });
    it("mtime ns", () => {
      assert.equal(actual.mtimeNsec, 0);
    });

    it("dev", () => {
      assert.equal(actual.dev, 16777221);
    });

    it("mode", () => {
      assert.equal(actual.mod, 0o0100644);
    });

    it("flags", () => {
      assert.equal(actual.flags, testPath.length);
    });
  });

  it("実行件のあるファイルのとき、modeを100755とする", () => {
    // Arrange
    const testStats = makeDummyFileStats({ mode: 33261 });

    // Act
    const actual = Entry.create(testPath, testOid, testStats);

    // Arrange
    assert.equal(actual.mod, 0o0100755);
  });
});

describe("Entry.parse", () => {
  it.skip("バイナリデータをパースする", async () => {
    // Arrange
    // const fakeRead = fakeFileHandleRead;
    // await fakeRead(Buffer.alloc(0), null, 12, null);
    // const { buffer } = await fakeRead(Buffer.alloc(72), null, 72, null);
    // const buf = fake
    // // Act
    // const actual = Entry.parse(buffer as Buffer);
    // // Assert
    // assert.deepEqual(
    //   actual,
    //   Entry.create(
    //     "b.txt",
    //     "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
    //     makeDummyFileStats(fakeFiles["b.txt"].stat),
    //   ),
    // );
  });
});

describe("Entry#toString", () => {
  it("Git indexエントリフォーマットに変換された文字列を返す", () => {
    // Arrange
    const testStats = makeDummyFileStats();

    // Act
    const entry = Entry.create(testPath, testOid, testStats);
    const actual = entry.toString();

    // Assert
    const expected = toBytes(
      "5e8f02ed", // ctime
      "00000000", // ctime nsec
      "5e8f02ec", // mtime
      "00000000", // mtime nsec
      "01000005", // device
      "0317b4ab", // inode
      "000081a4", // mode
      "000001f5", // uid
      "00000014", // gid
      "000000f0", // size
      "ba78afac62556e840341715936909cc36fe83a77", // oid
      "0009", // file's name length
      "524541444d452e6d64", // file name
      "00", // padding
    );
    assert.deepStrictEqual(Buffer.from(actual, "binary"), expected);
  });
});

describe("Entry#parentDirectories", () => {
  it("全ての親ディレクトリパスを返す", () => {
    // Arrange
    const testPath = path.posix.join("test", "nested", "nested2", "file.txt");

    // Act
    const entry = Entry.create(testPath, testOid, makeDummyFileStats());
    const actual = entry.parentDirectories;

    // Assert
    const expected = [
      path.posix.join("test"),
      path.posix.join("test", "nested"),
      path.posix.join("test", "nested", "nested2"),
    ];
    assert.deepEqual(actual, expected);
  });

  it("パスがファイル名のとき、空リストを返す", () => {
    // Act
    const entry = Entry.create("file.txt", testOid, makeDummyFileStats());
    const actual = entry.parentDirectories;

    // Assert
    assert.deepEqual(actual, []);
  });
});
