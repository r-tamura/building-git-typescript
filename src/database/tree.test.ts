import { Stats } from "fs";
import * as assert from "power-assert";
import { Entry, MODE } from "../entry";
import { scanUntil } from "../util";
import * as Database from ".";
import { Tree } from "./tree";
import { makeTestStats } from "../__test__";

const testStats = (mode: keyof typeof MODE) => {
  const stats = new Stats();
  stats.mode = mode === "readable" ? 0o0100644 : 0o0100755;
  return stats;
};

const unpackEntry = (s: string): [string, string, string, string] => {
  const buf = Buffer.from(s, "binary");
  const [mode, p] = scanUntil(" ", buf, 0);
  const [name, pp] = scanUntil("\0", buf, p);

  const packedHash = buf.slice(pp, pp + 20);
  const hash = packedHash.toString("hex");
  const rest = s.slice(pp + 20);
  return [mode, name, hash, rest];
};

const unpackEntries = (serializedEntry: string) => {
  let rest = serializedEntry;
  const entries = [];
  let count = 0;
  while (rest !== "") {
    const [mode, name, hash, _rest] = unpackEntry(rest);
    rest = _rest;
    entries.push(`${mode} ${name} ${hash}`);
    count++;
    if (count > 10) {
      throw Error("too many loop count");
    }
  }
  return entries.join("\n");
};

describe("Tree#traverse", () => {
  describe("Treeオブジェクトを含むTreeのとき、深さ優先でコールバック関数が呼び出される", () => {
    // Arrange
    const mockedCallback = jest
      .fn()
      .mockImplementation((tree: Database.Tree) => {
        tree.oid = Array(40).fill("a").join("");
        const strtree = tree.toString();
        return unpackEntries(strtree);
      });
    const entries = [
      new Entry(
        "test/hello.txt",
        "ce013625030ba8dba906f756967f9e9ca394464a",
        testStats("readable"),
      ),
      new Entry(
        "test/test2/world.txt",
        "cc628ccd10742baea8241c5924df992b5c019f71",
        testStats("readable"),
      ),
    ];

    // Act
    beforeAll(async () => {
      const tree = Database.Tree.build(entries);
      await tree.traverse(mockedCallback);
    });

    // Assert
    const test2 = new Database.Tree({
      "world.txt": new Entry(
        "test/test2/world.txt",
        "cc628ccd10742baea8241c5924df992b5c019f71",
        testStats("readable"),
      ),
    });
    test2.oid = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const test = new Database.Tree({
      "hello.txt": new Entry(
        "test/hello.txt",
        "ce013625030ba8dba906f756967f9e9ca394464a",
        testStats("readable"),
      ),
      test2,
    });
    test.oid = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    const root = new Database.Tree({
      test,
    });
    root.oid = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    it("should call 3 times", () => {
      assert.equal(mockedCallback.mock.calls.length, 3);
    });

    it("'test2' dir", () => {
      assert.deepStrictEqual(mockedCallback.mock.calls[0][0], test2);
      assert.equal(
        mockedCallback.mock.results[0].value,
        "100644 world.txt cc628ccd10742baea8241c5924df992b5c019f71",
      );
    });

    it("'test' dir", () => {
      assert.deepStrictEqual(mockedCallback.mock.calls[1][0], test);
      assert.equal(
        mockedCallback.mock.results[1].value,
        [
          "100644 hello.txt ce013625030ba8dba906f756967f9e9ca394464a",
          "40000 test2 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ].join("\n"),
      );
    });

    it("'root' dir", () => {
      assert.deepStrictEqual(mockedCallback.mock.calls[2][0], root);
      assert.equal(
        mockedCallback.mock.results[2].value,
        ["40000 test aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"].join("\n"),
      );
    });
  });
});

describe("Tree#toString", () => {
  const makeExpected = () => {
    const mode = Buffer.from("100644 "); // '100644' + ' '
    const firstFileName = Buffer.from("hello.txt\0");
    const firstFileHash = Buffer.from(
      "ce013625030ba8dba906f756967f9e9ca394464a",
      "hex",
    );
    const secondFileName = Buffer.from("world.txt\0");
    const secondFileHash = Buffer.from(
      "cc628ccd10742baea8241c5924df992b5c019f71",
      "hex",
    );

    const expected1 = Buffer.concat([mode, firstFileName, firstFileHash]);
    const expected2 = Buffer.concat([mode, secondFileName, secondFileHash]);
    const expected = Buffer.concat([expected1, expected2]);
    return expected;
  };

  it("Treeがシリアライズされる", () => {
    // Arrange
    const entries = [
      new Entry(
        "hello.txt",
        "ce013625030ba8dba906f756967f9e9ca394464a",
        testStats("readable"),
      ),
      new Entry(
        "world.txt",
        "cc628ccd10742baea8241c5924df992b5c019f71",
        testStats("readable"),
      ),
    ];

    // Act
    const tree = Database.Tree.build(entries);
    const actual = tree.toString();

    // assert
    const expected = makeExpected();
    assert.deepEqual(Buffer.from(actual, "binary"), expected);
  });

  it("ファイル名で昇順ソートされる", () => {
    // Arranges
    const entries = [
      new Entry(
        "world.txt",
        "cc628ccd10742baea8241c5924df992b5c019f71",
        testStats("readable"),
      ),
      new Entry(
        "hello.txt",
        "ce013625030ba8dba906f756967f9e9ca394464a",
        testStats("readable"),
      ),
    ];

    // Act
    const tree = Database.Tree.build(entries);
    const actual = tree.toString();

    // Assert
    const expected = makeExpected();
    assert.deepEqual(Buffer.from(actual, "binary"), expected);
  });

  it("実行権を持つファイルが含まれるとき、modeが100755になる", () => {
    // Arrange
    const entries = [
      new Entry(
        "hello.txt",
        "ce013625030ba8dba906f756967f9e9ca394464a",
        testStats("executable"),
      ),
    ];

    // Act
    const tree = Database.Tree.build(entries);
    const actual = tree.toString();
    const expected = "100755";

    // Assert
    assert.equal(actual.slice(0, 6), expected);
  });

  it("ディレクトリが含まれるとき、modeが40000になる", async () => {
    // Arrange
    const entries = [
      new Entry(
        "test/nested/hello.txt",
        "ce013625030ba8dba906f756967f9e9ca394464a",
        testStats("readable"),
      ),
    ];

    // Act
    const tree = Database.Tree.build(entries);
    await tree.traverse(async (tree) => {
      tree.oid = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      return;
    });
    const actual = tree.toString();

    // Assert
    const expected = "40000";

    assert.equal(actual.slice(0, 5), expected);
  });
});

describe("Tree.parse", () => {
  it("複数のblobからなるTreeオブジェクトをパースする", () => {
    // Arrange
    const input = Buffer.from(
      new Database.Tree({
        "test.txt": new Database.Entry(
          "ec635144f60048986bc560c5576355344005e6e7",
          0o0100644,
        ),
        dir: new Database.Entry(
          "ff1c31c22e6b80ace79f41a8344042941e572b08",
          0o040000,
        ),
      }).toString(),
      "binary",
    );

    // Act
    const actual = Database.Tree.parse(input);

    // Assert
    assert.equal(actual.toString(), input.toString("binary"));
  });
});

describe("Tree#addEntry", () => {
  it("親ディレクトリを持つエントリのとき、親ディレクトリのパスのbasenameをキーとして追加する", () => {
    // Act
    const tree = new Tree();
    tree.addEntry(
      ["dir", "dir/nested"],
      new Entry("hello.txt", "oid", makeTestStats()),
    );

    // Assert
    assert.deepEqual(tree.entries, {
      dir: new Tree({
        nested: new Tree({
          "hello.txt": new Entry("hello.txt", "oid", makeTestStats()),
        }),
      }),
    });
  });
});
