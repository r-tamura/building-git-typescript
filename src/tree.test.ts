import { Entry } from "./entry";
import { Tree } from "./tree";
import * as assert from "assert";

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
    const entries = [
      new Entry("hello.txt", "ce013625030ba8dba906f756967f9e9ca394464a"),
      new Entry("world.txt", "cc628ccd10742baea8241c5924df992b5c019f71")
    ];

    // Act
    const tree = new Tree(entries);
    const actual = tree.toString();

    // assert
    const expected = makeExpected();
    assert.deepEqual(Buffer.from(actual, "binary"), expected);
  });

  it("ファイル名で昇順ソートされる", () => {
    // Arrange
    const entries = [
      new Entry("world.txt", "cc628ccd10742baea8241c5924df992b5c019f71"),
      new Entry("hello.txt", "ce013625030ba8dba906f756967f9e9ca394464a")
    ];

    // Act
    const tree = new Tree(entries);
    const actual = tree.toString();

    // Assert
    const expected = makeExpected();
    assert.deepEqual(Buffer.from(actual, "binary"), expected);
  });
});
