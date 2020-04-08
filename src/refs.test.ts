import { Refs } from "./refs";
import { defaultFs } from "./services";
import * as assert from "power-assert";

describe("Refs#readHead", () => {
  const testRootPath = "/test/project";
  it("HEADファイルが存在するとき、HEADファイルのデータを返す", async () => {
    // Arrange
    const mockedReadFile = jest
      .fn()
      .mockResolvedValue("ref: refs/heads/master");
    const env = {
      fs: { ...defaultFs, readFile: mockedReadFile }
    };

    // Act
    const refs = new Refs(testRootPath, env);
    const actual = await refs.readHead();

    // Assert
    assert.equal(actual, "ref: refs/heads/master");
  });

  it("HEADファイルが存在しないとき、nullを返す", async () => {
    // Arrange
    const mockedReadFile = jest.fn().mockImplementation(() => {
      throw { code: "ENOENT" } as NodeJS.ErrnoException;
    });
    const env = {
      fs: { ...defaultFs, readFile: mockedReadFile }
    };

    // Act
    const refs = new Refs(testRootPath, env);
    const actual = await refs.readHead();

    // Assert
    assert.equal(actual, null);
  });
});
