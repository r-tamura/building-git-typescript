import { Entry } from "./entry";
import { Tree } from "./tree";
import * as assert from "assert";
import { Stats } from "fs";

const testStats = (mode: "regular" | "exec") => {
  // regular: 33188 executable
  const stats = new Stats();
  stats.mode = mode === "regular" ? 33188 : 33261;
  return stats;
};

describe("Tree#toString", () => {
  // Arrange
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
      )
    ];

    // Act
    const tree = new Tree(entries);
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
      )
    ];

    // Act
    const tree = new Tree(entries);
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
      )
    ];

    // Act
    const tree = new Tree(entries);
    const actual = tree.toString();
    const expected = "100755";

    // Assert
    assert.equal(actual.slice(0, 6), expected);
  });
});
