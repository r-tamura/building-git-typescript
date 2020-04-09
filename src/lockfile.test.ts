import { Lockfile, MissingParent, NoPermission } from "./lockfile";
import { defaultFs } from "./services";
import { constants } from "fs";
import * as assert from "power-assert";

const EEXIST = { code: "EEXIST" };
const ENOENT = { code: "ENOENT" };
const EACCES = { code: "EACCES" };

describe("Lockfile#holdForUpdate", () => {
  const testPath = "/test/file.txt";
  describe("ロックされていないとき、ロックを取得して、trueを返す", () => {
    const mockedOpen = jest.fn().mockResolvedValue({ close: jest.fn() });
    let actual: boolean;
    beforeAll(async () => {
      // Arrange
      const env = {
        fs: { ...defaultFs, open: mockedOpen }
      };

      // Act
      const lockfile = new Lockfile(testPath, env);
      actual = await lockfile.holdForUpdate();
    });

    // Assert
    it("ロック取得", () => {
      const flags = constants.O_RDWR | constants.O_CREAT | constants.O_EXCL;
      assert.equal(mockedOpen.mock.calls[0][0], "/test/file.lock");
      assert.equal(mockedOpen.mock.calls[0][1], flags);
    });

    it("trueを返す", () => {
      assert.equal(actual, true);
    });
  });

  it("ロックファイルがすでに存在するとき、falseを返す", async () => {
    // Arrange
    const mockedOpen = jest.fn().mockImplementation(() => {
      throw EEXIST;
    });
    const env = {
      fs: { ...defaultFs, open: mockedOpen }
    };

    // Act
    const lockfile = new Lockfile(testPath, env);
    const actual = await lockfile.holdForUpdate();

    // Assert
    assert.equal(actual, false);
  });

  it.each([
    [
      "ロックファイルの親ディレクリパスが存在しないとき",
      "例外を発生させる",
      jest.fn().mockImplementation(() => {
        throw ENOENT;
      }),
      MissingParent
    ],
    [
      "ロックファイル作成権限がないときが存在しないとき",
      "例外を発生させる",
      jest.fn().mockImplementation(() => {
        throw EACCES;
      }),
      NoPermission
    ]
  ])("%s、%s", async (_given, _should, mockedOpen, ExpectedError) => {
    // Arrange
    const env = {
      fs: { ...defaultFs, open: mockedOpen }
    };
    // Act
    const lockfile = new Lockfile(testPath, env);

    // Assert
    await expect(lockfile.holdForUpdate()).rejects.toThrow(ExpectedError);
  });
});
