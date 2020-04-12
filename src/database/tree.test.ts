import { Entry } from "../entry";
import { Tree } from "./tree";
import * as assert from "assert";
import { Stats } from "fs";

const testStats = (mode: "regular" | "exec") => {
  // regular: 33188 executable
  const stats = new Stats();
  stats.mode = mode === "regular" ? 33188 : 33261;
  return stats;
};

const unpackEntry = (s: string) => {
  let pp;
  let p = 0;
  while (s[p] && s[p] !== " ") {
    p++;
  }
  const mode = s.slice(0, p);
  p++;
  pp = p;
  while (s[p] && s[p] !== "\0") {
    p++;
  }
  const name = s.slice(pp, p);
  p++;
  pp = p;
  const packedHash = s.slice(p, p + 20);
  const hash = Buffer.from(packedHash, "binary").toString("hex");
  const rest = s.slice(p + 20);
  return [mode, name, hash, rest];
};

const unpackEntries = (serializedEntry: string) => {
  let rest = serializedEntry;
  let entries = [];
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

//  unpackEntries('a b\0ce013625030ba8dba906')

describe("Tree#traverse", () => {
  describe("Treeオブジェクトを含むTreeのとき、深さ優先でコールバック関数が呼び出される", () => {
    // Arrange
    const mockedCallback = jest.fn().mockImplementation((tree: Tree) => {
      tree.oid = Array(40).fill("a").join("");
      const strtree = tree.toString();
      return unpackEntries(strtree);
    });
    const entries = [
      new Entry(
        "test/hello.txt",
        "ce013625030ba8dba906f756967f9e9ca394464a",
        testStats("regular")
      ),
      new Entry(
        "test/test2/world.txt",
        "cc628ccd10742baea8241c5924df992b5c019f71",
        testStats("regular")
      ),
    ];

    // Act
    const tree = Tree.build(entries);
    tree.traverse(mockedCallback);

    // Assert
    it("should call 3 times", () => {
      assert.equal(mockedCallback.mock.calls.length, 3);
    });

    it("'test2' Tree", () => {
      const expectedTree = new Tree();
      expectedTree.oid = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      assert.deepStrictEqual(mockedCallback.mock.calls[0][0], expectedTree);
      assert.equal(
        mockedCallback.mock.results[0].value,
        "100644 world.txt cc628ccd10742baea8241c5924df992b5c019f71"
      );
    });

    it("'test' Tree", () => {
      const expectedTree = new Tree();
      expectedTree.oid = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      assert.deepStrictEqual(mockedCallback.mock.calls[1][0], expectedTree);
      assert.equal(
        mockedCallback.mock.results[1].value,
        [
          "100644 hello.txt ce013625030ba8dba906f756967f9e9ca394464a",
          "40000 test2 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ].join("\n")
      );
    });

    it("'root' Tree", () => {
      assert.equal(
        mockedCallback.mock.results[2].value,
        ["40000 test aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"].join("\n")
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
      "hex"
    );
    const secondFileName = Buffer.from("world.txt\0");
    const secondFileHash = Buffer.from(
      "cc628ccd10742baea8241c5924df992b5c019f71",
      "hex"
    );

    const expected1 = Buffer.concat([mode, firstFileName, firstFileHash]);
    const expected2 = Buffer.concat([mode, secondFileName, secondFileHash]);
    const expected = Buffer.concat([expected1, expected2]);
    return expected;
  };

  it("Treeがシリアライズされる", () => {
    // Arrange
    new Stats();
    const entries = [
      new Entry(
        "hello.txt",
        "ce013625030ba8dba906f756967f9e9ca394464a",
        testStats("regular")
      ),
      new Entry(
        "world.txt",
        "cc628ccd10742baea8241c5924df992b5c019f71",
        testStats("regular")
      ),
    ];

    // Act
    const tree = Tree.build(entries);
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
        testStats("regular")
      ),
      new Entry(
        "hello.txt",
        "ce013625030ba8dba906f756967f9e9ca394464a",
        testStats("regular")
      ),
    ];

    // Act
    const tree = Tree.build(entries);
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
        testStats("exec")
      ),
    ];

    // Act
    const tree = Tree.build(entries);
    const actual = tree.toString();
    const expected = "100755";

    // Assert
    assert.equal(actual.slice(0, 6), expected);
  });

  it("ディレクトリが含まれるとき、modeが40000になる", () => {
    // Arrange
    const entries = [
      new Entry(
        "test/hello.txt",
        "ce013625030ba8dba906f756967f9e9ca394464a",
        testStats("regular")
      ),
    ];

    // Act
    const tree = Tree.build(entries);
    tree.traverse(async (tree) => {
      tree.oid = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    });
    const actual = tree.toString();

    // Assert
    const expected = "40000";
    assert.equal(actual.slice(0, 5), expected);
  });
});
