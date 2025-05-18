import type { Stats } from "fs";
import * as assert from "power-assert";
import * as Database from ".";
import { makeDummyFileStats, mockFsStats } from "../__test__/fs.ts";
import { Entry, MODE } from "../entry.ts";
import { scanUntil } from "../util";
import { posixPath } from "../util/fs";
import { Tree } from "./tree";

const testStats = (mode: keyof typeof MODE): Stats => {
  const stats = mockFsStats();
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
    const ANY_OID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    const middleEntry = new Entry(
      "test/hello.txt",
      "ce013625030ba8dba906f756967f9e9ca394464a",
      testStats("readable"),
    );
    const deepestEntry = new Entry(
      "test/test2/world.txt",
      "cc628ccd10742baea8241c5924df992b5c019f71",
      testStats("readable"),
    );
    // Arrange
    const traverseCallback = jest
      .fn()
      .mockImplementation((tree: Database.Tree) => {
        tree.oid = ANY_OID;
        const strtree = tree.toString();
        return unpackEntries(strtree);
      });
    const entries = [middleEntry, deepestEntry];

    // Act
    let root: Database.Tree;
    let deepest: Database.Tree;
    let middle: Database.Tree;
    beforeEach(async () => {
      traverseCallback.mockClear();
      deepest = new Database.Tree({
        "world.txt": deepestEntry,
      });
      deepest.oid = ANY_OID;
      middle = new Database.Tree({
        "hello.txt": middleEntry,
        test2: deepest,
      });
      middle.oid = ANY_OID;

      root = new Database.Tree({
        test: middle,
      });
      root.oid = ANY_OID;
    });

    it("should be called 3 times", async () => {
      const tree = Database.Tree.build(entries);
      await tree.traverse(traverseCallback);
      assert.equal(traverseCallback.mock.calls.length, 3);
    });

    it("ディレクトリ構造上深い順にコールバックが呼ばれる", async () => {
      // Arrange
      const tree = Database.Tree.build(entries);

      // Act
      await tree.traverse(traverseCallback);

      // Assert
      const callbackCalls = traverseCallback.mock.calls.map((args) => args[0]);
      const expectedCalls = [
        {
          arg: deepest,
          return: "100644 world.txt cc628ccd10742baea8241c5924df992b5c019f71",
        },
        {
          arg: middle,
          return: [
            "100644 hello.txt ce013625030ba8dba906f756967f9e9ca394464a",
            "40000 test2 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          ].join("\n"),
        },
        {
          arg: root,
          return: ["40000 test aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"].join(
            "\n",
          ),
        },
      ] as const;

      for (let i = 0; i < callbackCalls.length; i++) {
        assert.deepStrictEqual(
          callbackCalls[i],
          expectedCalls[i].arg,
          "コールバックの引数",
        );
        assert.deepStrictEqual(
          traverseCallback.mock.results[i].value,
          expectedCalls[i].return,
          "コールバックの返り値",
        );
      }
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
      ["dir", "dir/nested"].map(posixPath),
      new Entry("hello.txt", "oid", makeDummyFileStats()),
    );

    // Assert
    assert.deepEqual(tree.entries, {
      dir: new Tree({
        nested: new Tree({
          "hello.txt": new Entry("hello.txt", "oid", makeDummyFileStats()),
        }),
      }),
    });
  });
});
