import { Commit } from "./commit";
import { Author } from "./author";
import * as assert from "power-assert";

jest.mock("./author", () => ({
  Author: jest.fn().mockImplementation(() => ({
    toString: () => "JohnDoe <johndoe@test.local> 1585666800000 +0900"
  }))
}));

describe("Commit#toString", () => {
  it("parentが存在しないとき、tree,author,commiter,messageが指定されたフォーマットで返される", () => {
    // Arrange
    const parentOId = null;
    const treeOId = "123456789abcdeffedcba98765abcdef12345678";
    const author = new Author(
      "John Doe",
      "johndoe@test.local",
      new Date(2020, 3, 1)
    );

    // Act
    const commit = new Commit(parentOId, treeOId, author, "test commit");
    const actual = commit.toString();

    // Assert
    assert.equal(
      actual,
      `tree ${treeOId}
author JohnDoe <johndoe@test.local> 1585666800000 +0900
committer JohnDoe <johndoe@test.local> 1585666800000 +0900

test commit`
    );
  });

  it("parentが存在するとき、tree,parent,author,commiter,messageが指定されたフォーマットで返される", () => {
    // Arrange
    const parentOId = "abcdef987654321fedcba98765abcdef12345678";
    const treeOId = "123456789abcdeffedcba98765abcdef12345678";
    const author = new Author(
      "John Doe",
      "johndoe@test.local",
      new Date(2020, 3, 1)
    );

    // Act
    const commit = new Commit(parentOId, treeOId, author, "test commit");
    const actual = commit.toString();

    // Assert
    assert.equal(
      actual,
      `tree ${treeOId}
parent ${parentOId}
author JohnDoe <johndoe@test.local> 1585666800000 +0900
committer JohnDoe <johndoe@test.local> 1585666800000 +0900

test commit`
    );
  });
});
