import { describe, it, beforeEach, afterEach, vi } from "vitest";
import assert from "node:assert";
import { toLF } from "../util/index.js";
import { Author } from "./author.js";
import { Commit } from "./commit.js";

describe("Commit#toString", () => {
  // toString が getTimezoneOffset() で TZ 文字列を作るため、CI の TZ に依存しないよう JST 固定
  beforeEach(() => {
    vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-540);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parentが存在しないとき、tree,author,commiter,messageが指定されたフォーマットで返される", () => {
    // Arrange
    const treeOId = "123456789abcdeffedcba98765abcdef12345678";
    const author = new Author(
      "JohnDoe",
      "johndoe@test.local",
      new Date(1585666800 * 1000),
    );

    // Act
    const commit = new Commit([], treeOId, author, author, "test commit");
    const actual = commit.toString();

    // Assert
    assert.equal(
      toLF(actual),
      `tree ${treeOId}
author JohnDoe <johndoe@test.local> 1585666800 +0900
committer JohnDoe <johndoe@test.local> 1585666800 +0900

test commit`,
    );
  });

  it("parentが存在するとき、tree,parent,author,commiter,messageが指定されたフォーマットで返される", () => {
    // Arrange
    const parentOId = "abcdef987654321fedcba98765abcdef12345678";
    const treeOId = "123456789abcdeffedcba98765abcdef12345678";
    const author = new Author(
      "JohnDoe",
      "johndoe@test.local",
      new Date(1585666800 * 1000),
    );

    // Act
    const commit = new Commit(
      [parentOId],
      treeOId,
      author,
      author,
      "test commit",
    );
    const actual = commit.toString();

    // Assert
    assert.equal(
      toLF(actual),
      `tree ${treeOId}
parent ${parentOId}
author JohnDoe <johndoe@test.local> 1585666800 +0900
committer JohnDoe <johndoe@test.local> 1585666800 +0900

test commit`,
    );
  });
});

describe("Commit.parse", () => {
  it("rootコミットのとき、parentなしのコミットオブジェクトとしてパースする", () => {
    // Arrange
    const author = new Author(
      "JohnDoe",
      "johndoe@test.local",
      new Date(1585666800 * 1000),
    );
    const rawCommit = Buffer.from(
      new Commit(
        [],
        "123456789abcdeffedcba98765abcdef12345678",
        author,
        author,
        "test commit",
      ).toString(),
      "binary",
    );

    // Act
    const actual = Commit.parse(rawCommit);

    // Assert
    assert.deepEqual(actual.toString(), rawCommit.toString());
  });

  it("rootコミット以外のとき、parentありのコミットオブジェクトとしてパースする", () => {
    // Arrange
    const author = new Author(
      "JohnDoe",
      "johndoe@test.local",
      new Date(1585666800 * 1000),
    );
    const rawCommit = Buffer.from(
      new Commit(
        ["d8fd39d0bbdd2dcf322d8b11390a4c5825b11495"],
        "123456789abcdeffedcba98765abcdef12345678",
        author,
        author,
        "test commit",
      ).toString(),
      "binary",
    );

    // Act
    const actual = Commit.parse(rawCommit);

    // Assert
    assert.deepEqual(actual.toString(), rawCommit.toString());
  });
});
