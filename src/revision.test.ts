import {
  Ref,
  Parent,
  Ancestor,
  Revision,
  Rev,
  InvalidObject,
  HintedError,
} from "./revision";
import * as assert from "power-assert";
import { Database, Commit, Author, Blob } from "./database";
import { Refs } from "./refs";
import { Repository } from "./repository";
import { NonNullGitObject } from "./types";

const mockCommit = (oid: string) => {
  const commit = new Commit(
    null,
    "testtree123456",
    new Author("", "", new Date(2020, 3, 1)),
    [`message is ${oid}`].join("\n")
  );
  commit.oid = oid;
  return commit as NonNullGitObject;
};
const mockBlob = (oid: string) => {
  const blob = new Blob("");
  blob.oid = oid;
  return blob as NonNullGitObject;
};

const mockRepo = () => new Repository(".git", {} as any);

describe("Revision.parse", () => {
  type Test = [string, string, Rev];
  it.each([
    ["エイリアス", "@^", Parent.of(Ref.of("HEAD"))],
    ["~(数字)", "HEAD~42", Ancestor.of(Ref.of("HEAD"), 42)],
    ["^", "HEAD^^", Parent.of(Parent.of(Ref.of("HEAD")))],
    ["~と^の混合", "abc123~3^", Parent.of(Ancestor.of(Ref.of("abc123"), 3))],
  ] as Test[])("%s", (_tilte, revision, expected) => {
    // Act
    const actual = Revision.parse(revision);

    // Assert
    assert.deepEqual(actual, expected);
  });
});

describe("Revision#readRef", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("revesionに対応するOIDが存在するとき、OIDを返す", async () => {
    // Arrange
    const spyReadRef = jest
      .spyOn(Refs.prototype, "readRef")
      .mockResolvedValue("3a3c4ec0ae9589c881029c161dd129bcc318dc08");

    // Act
    const rev = new Revision(mockRepo(), "HEAD");
    const actual = await rev.readRef("topic");

    // Assert
    assert.equal(spyReadRef.mock.calls[0][0], "topic", "refsからの読み出し");
    assert.equal(actual, "3a3c4ec0ae9589c881029c161dd129bcc318dc08", "返り値");
  });

  it("prefixに該当するOIDが1つのみ存在するとき、OIDを返す", async () => {
    // Arrange
    jest.spyOn(Refs.prototype, "readRef").mockResolvedValue(null);
    const spyPrefixMatch = jest
      .spyOn(Database.prototype, "prefixMatch")
      .mockResolvedValue(["3a3c4ec0ae9589c881029c161dd129bcc318dc08"]);

    // Act
    const rev = new Revision(mockRepo(), "HEAD");
    const actual = await rev.readRef("3a3c4ec");

    // Assert
    assert.equal(
      spyPrefixMatch.mock.calls[0][0],
      "3a3c4ec",
      "オブジェクトIDのprefixによる検索"
    );
    assert.equal(actual, "3a3c4ec0ae9589c881029c161dd129bcc318dc08", "返り値");
  });

  it("prefixに該当するOIDが2つ以上存在するとき、エラーメッセージを保存し、nullを返す", async () => {
    // Arrange

    const testObjects = {
      "3a3c4ec0ae9589c881029c161dd129bcc318dc08": mockCommit(
        "3a3c4ec0ae9589c881029c161dd129bcc318dc08"
      ),
      "3a3c4ec0ae9589c881029c161dd129bcc318dzzz": mockCommit(
        "3a3c4ec0ae9589c881029c161dd129bcc318dzzz"
      ),
      "3a3c4ec0ae9589c881029c161dd129bcc3object": mockBlob(
        "3a3c4ec0ae9589c881029c161dd129bcc3object"
      ),
    } as const;

    jest.spyOn(Refs.prototype, "readRef").mockResolvedValue(null);
    jest
      .spyOn(Database.prototype, "prefixMatch")
      .mockResolvedValue(Object.keys(testObjects));

    jest
      .spyOn(Database.prototype, "load")
      .mockImplementation((oid: string) =>
        Promise.resolve(testObjects[oid as keyof typeof testObjects])
      );
    const testPrefix = "3a3c4ec";

    jest.spyOn(Database.prototype, "shortOid").mockReturnValue(testPrefix);

    // Act
    const rev = new Revision(mockRepo(), "HEAD");
    const actual = await rev.readRef("3a3c4ec");

    // Assert
    assert.deepEqual(
      rev.errors[0].hint,
      [
        "The candidates are:",
        `  3a3c4ec commit 2020-04-01 - message is 3a3c4ec0ae9589c881029c161dd129bcc318dc08`,
        `  3a3c4ec commit 2020-04-01 - message is 3a3c4ec0ae9589c881029c161dd129bcc318dzzz`,
        `  3a3c4ec blob`,
      ],
      "エラーメッセージ"
    );
    assert.equal(actual, null, "返り値");
  });
});

describe("Revision#resolve", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("該当するオブジェクトが存在するとき、OIDを返す", async () => {
    // Arrange
    jest
      .spyOn(Parent.prototype, "resolve")
      .mockResolvedValue("3a3c4ec0ae9589c881029c161dd129bcc318dc08");

    // Act
    const rev = new Revision(mockRepo(), "HEAD^");
    const actual = await rev.resolve();

    // Assert
    assert.equal(actual, "3a3c4ec0ae9589c881029c161dd129bcc318dc08");
  });

  it("該当するオブジェクトが存在しないとき、例外を発生させる", async () => {
    // Arrange
    jest.spyOn(Parent.prototype, "resolve").mockResolvedValue(null);

    // Act
    const rev = new Revision(mockRepo(), "aaaaaaa^");
    const actual = rev.resolve();

    // Assert
    await expect(actual).rejects.toThrow(InvalidObject);
  });

  it("オブジェクトのタイプが指定され、存在したオブエクとが該当するタイプのオブジェクトでないとき、例外を発生させる", async () => {
    // Arrange
    const blob = mockBlob("3a3c4ec0ae9589c881029c161dd129bcc318dc08");
    jest
      .spyOn(Parent.prototype, "resolve")
      .mockResolvedValue("3a3c4ec0ae9589c881029c161dd129bcc318dc08");
    jest.spyOn(Database.prototype, "load").mockResolvedValue(blob);

    // Act
    const rev = new Revision(mockRepo(), "aaaaaaa^");
    const actual = rev.resolve("commit");

    // Assert
    await expect(actual).rejects.toThrow(InvalidObject);

    assert.deepEqual(
      rev.errors,
      [
        new HintedError(
          "object 3a3c4ec0ae9589c881029c161dd129bcc318dc08 is a blob, not a commit",
          []
        ),
      ],
      "エラーメッセージ"
    );
  });
});
