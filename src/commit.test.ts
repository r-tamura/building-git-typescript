import { Commit } from "./commit";
import { Author } from "./author";
import * as assert from "power-assert";

jest.mock("./author", () => ({
  Author: jest.fn().mockImplementation(() => ({
    toString: () => "JohnDoe <johndoe@test.local> 1585666800000 +0900"
  }))
}));

describe("Commit#toString", () => {
  it("tree,author,commiter,messageが指定されたフォーマットで返される", () => {
    // Arrange
    const treeOId = "123456789abcdeffedcba98765abcdef12345678";
    const author = new Author(
      "John Doe",
      "johndoe@test.local",
      new Date(2020, 3, 1)
    );

    // Act
    const commit = new Commit(treeOId, author, "test commit");
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
});
