import { Refs, LockDenied } from "./refs";
import { defaultFs } from "./services";
import * as assert from "power-assert";
import { Lockfile } from "./lockfile";

jest.mock("./lockfile");

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

describe("Refs#updateHead", () => {
  const testRootPath = "/test/project";
  const testOId = "123456789abcdeffedcba98765abcdef12345678";
  describe("ロックファイルがロックされていないとき、HEADを更新する", () => {
    // Arrange
    const mockedWrite = jest.fn();
    const mockedCommit = jest.fn();
    const MockedLockfile = ((Lockfile as unknown) as jest.Mock<
      Partial<Lockfile>
    >).mockImplementationOnce((pathname: string) => ({
      holdForUpdate: jest.fn().mockResolvedValue(true),
      write: mockedWrite,
      commit: mockedCommit
    }));
    beforeAll(async () => {
      // Act
      const refs = new Refs(testRootPath);
      await refs.updateHead(testOId);
    });

    // Assert
    it("ファイルにOIDが書き込まれる", () => {
      assert.equal(mockedWrite.mock.calls.length, 2);
      const calls = mockedWrite.mock.calls;
      assert.equal(calls[0][0], testOId);
      assert.equal(calls[1][0], "\n");
    });

    it("コミットされる", () => {
      assert.equal(mockedCommit.mock.calls.length, 1);
    });
  });

  describe("ロックファイルがロックされているとき、HEADファイルを更新しない", () => {
    // Arrange
    const mockedWrite = jest.fn();
    const mockedCommit = jest.fn();
    const MockedLockfile = ((Lockfile as unknown) as jest.Mock<
      Partial<Lockfile>
    >).mockImplementationOnce((pathname: string) => ({
      holdForUpdate: jest.fn().mockResolvedValue(false),
      write: mockedWrite,
      commit: mockedCommit
    }));
    beforeAll(async () => {
      // Act & Assert
      const refs = new Refs(testRootPath);
      const actual = refs.updateHead(testOId);
      await expect(actual).rejects.toThrow(LockDenied);
    });

    // Assert
    it("ファイルにOIDが書き込まれない", () => {
      assert.equal(mockedWrite.mock.calls.length, 0);
    });
  });
});
