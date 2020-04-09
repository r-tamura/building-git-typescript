import * as assert from "power-assert";
import { Workspace } from "./workspace";
import { defaultFs } from "./services";

describe("WorkSpace#listFiles", () => {
  it("'.', '..', '.git'以外のファイルを全て返す", async () => {
    // Arrange
    const mockedReaddir = jest
      .fn()
      .mockResolvedValue([".", "..", ".git", "a.txt", "dir"]);

    // Act
    const ws = new Workspace("/test/jit", {
      fs: { ...defaultFs, readdir: mockedReaddir }
    });
    const actual = await ws.listFiles();

    // Assert
    const expected = ["a.txt", "dir"];
    assert.deepEqual(expected, actual);
  });
});

describe("Workspace#readFile", () => {
  const testContent = [
    `Lorem Ipsum is simply dummy text of the printing and typesetting industry. `,
    `Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, `,
    `when an unknown printer took a galley of type and scrambled it to make a type specimen book.`
  ].join("\n");
  const mockedReadFile = jest.fn().mockResolvedValue(testContent);
  let actual: string | null = null;
  beforeAll(async () => {
    // Arrange

    // Act
    const ws = new Workspace("/test/jit", {
      fs: { ...defaultFs, readFile: mockedReadFile }
    });
    actual = await ws.readFile("src/index.js");
  });
  // Assert
  it("ファイルパス", () => {
    assert.equal(mockedReadFile.mock.calls[0][0], "/test/jit/src/index.js");
  });
  it("ファイルの全データを返す", () => {
    const expected = testContent;
    assert.equal(expected, actual);
  });
});
