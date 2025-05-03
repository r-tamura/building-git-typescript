import { constants } from "fs";
import * as path from "path";
import * as assert from "power-assert";
import { EACCES, EEXIST, ENOENT } from "./__test__";
import { Lockfile, MissingParent, NoPermission } from "./lockfile";
import { LockDenied } from "./refs";
import { defaultFs } from "./services";
import { osPath, posixPath } from "./util/fs";

const TEST_TARGET_PATH = posixPath("/test/file.txt");

const mockedClose = jest.fn();
const mockedOpen = jest.fn().mockResolvedValue({ close: mockedClose });
const mockedUnlink = jest.fn().mockResolvedValue(undefined);
const mockedRename = jest.fn();
const env = {
  fs: {
    ...defaultFs,
    open: mockedOpen,
    unlink: mockedUnlink,
    rename: mockedRename,
  },
};

describe("Lockfile#holdForUpdate", () => {
  describe("ロックされていないとき、ロックを取得して、trueを返す", () => {
    let actual: boolean;
    beforeAll(async () => {
      // Act
      const lockfile = new Lockfile(TEST_TARGET_PATH, env);
      await lockfile.holdForUpdate();
    });

    // Assert
    it("ロック取得", () => {
      const flags = constants.O_RDWR | constants.O_CREAT | constants.O_EXCL;
      assert.equal(mockedOpen.mock.calls[0][0], path.join("/test", "file.lock"));
      assert.equal(mockedOpen.mock.calls[0][1], flags);
    });
  });

  it("ロックファイルがすでに存在するとき、例外を発生させる", async () => {
    // Arrange
    const mockedOpen = jest.fn().mockImplementation(() => {
      throw EEXIST;
    });
    const env = {
      fs: { ...defaultFs, open: mockedOpen },
    };

    // Act
    const lockfile = new Lockfile(TEST_TARGET_PATH, env);
    const actual = lockfile.holdForUpdate();

    // Assert
    await expect(actual).rejects.toThrow(LockDenied);
  });

  it.each([
    [
      "ロックファイルの親ディレクリパスが存在しないとき",
      "例外を発生させる",
      jest.fn().mockImplementation(() => {
        throw ENOENT;
      }),
      MissingParent,
    ],
    [
      "ロックファイル作成権限がないときが存在しないとき",
      "例外を発生させる",
      jest.fn().mockImplementation(() => {
        throw EACCES;
      }),
      NoPermission,
    ],
  ])("%s、%s", async (_given, _should, mockedOpen, ExpectedError) => {
    // Arrange
    const env = {
      fs: { ...defaultFs, open: mockedOpen },
    };
    // Act
    const lockfile = new Lockfile(TEST_TARGET_PATH, env);

    // Assert
    await expect(lockfile.holdForUpdate()).rejects.toThrow(ExpectedError);
  });
});

describe("Lockfile#commit", () => {
  it("ロックファイルを対象のファイルへ反映する", async () => {
    // Arrange
    jest.clearAllMocks();

    // Act
    const lockfile = new Lockfile(TEST_TARGET_PATH, env);
    await lockfile.holdForUpdate();
    await lockfile.commit();

    // Assert
    assert.equal(mockedRename.mock.calls[0][0], path.join("/test", "file.lock"));
    assert.equal(mockedRename.mock.calls[0][1], osPath(TEST_TARGET_PATH));
  });
});

describe("Lockfile#rollback", () => {
  it("ロックファイルを削除する", async () => {
    // Arrange
    jest.clearAllMocks();

    // Act
    const lockfile = new Lockfile(TEST_TARGET_PATH, env);
    await lockfile.holdForUpdate();
    await lockfile.rollback();

    // Assert
    assert.equal(mockedUnlink.mock.calls[0][0], path.join("/test", "file.lock"));
  });
});
