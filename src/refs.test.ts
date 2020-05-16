import { Refs, LockDenied, InvalidBranch } from "./refs";
import * as Service from "./services";
import * as assert from "power-assert";
import { Lockfile } from "./lockfile";
import { defaultFs, FileService } from "./services";

jest.mock("./lockfile");
const MockedLockfile = (Lockfile as unknown) as jest.Mock<Partial<Lockfile>>;

const mockEnv = (mock: Partial<FileService> = {}) => ({
  fs: {
    ...defaultFs,
    ...mock,
  },
});

describe("Refs#createBranch", () => {
  describe("不正なブランチ名のとき、例外を発生させる", () => {
    it.each([
      ["'.'で始まる", ".branch"],
      ["'/.'で始まる", "/.branch"],
      ["'..'を含む", ".."],
      ["'/'で終わる", "branch/"],
      ["'.lock'で終わる", "branch.lock"],
      ["'@{'を含む", "br@{nch"],
      ["ASCII制御文字を含む(タブ)", "br\tanch"],
      ["ASCII制御文字を含む(DEL)", "\u007F"],
    ])("%s", async (_title, branchName) => {
      const refs = new Refs(".git");
      // Act & Assert
      await expect(refs.createBranch(branchName, "3a3c4ec")).rejects.toThrow(
        InvalidBranch
      );
    });
  });

  it("ブランチがすでに存在するとき、例外を発生させる", async () => {
    // Arrange
    const alreadyExists = jest.spyOn(Service, "exists").mockResolvedValue(true);

    // Act
    const refs = new Refs(".git");
    const actual = refs.createBranch("topic", "3a3c4ec");

    // Assert
    await expect(actual).rejects.toThrow(InvalidBranch);

    alreadyExists.mockReset();
  });
});

describe("Refs#readHead", () => {
  const testRootPath = "/test/project";
  it("HEADファイルが存在するとき、HEADファイルのデータを返す", async () => {
    // Arrange
    const mockedReadFile = jest
      .fn()
      .mockResolvedValue("ref: refs/heads/master\n");
    const env = {
      fs: { ...Service.defaultFs, readFile: mockedReadFile },
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
      fs: { ...Service.defaultFs, readFile: mockedReadFile },
    };

    // Act
    const refs = new Refs(testRootPath, env);
    const actual = await refs.readHead();

    // Assert
    assert.equal(actual, null);
  });
});

describe("Refs#readRef", () => {
  describe("refファイルが存在するとき、Ref IDを返す", () => {
    const mockedReadFile = jest
      .fn()
      .mockResolvedValue("3a3c4ec0ae9589c881029c161dd129bcc318dc08\n");
    let spyServiceExists: jest.SpyInstance;
    let actual: string | null;
    beforeAll(async () => {
      // Arrange
      spyServiceExists = jest
        .spyOn(Service, "exists")
        .mockImplementation(async (_fs, pathname) =>
          pathname.includes("heads")
        );
      const env = mockEnv({ readFile: mockedReadFile });

      // Act
      const refs = new Refs(".git", env);
      actual = await refs.readRef("master");
    });

    afterAll(() => {
      spyServiceExists.mockReset();
    });
    it("ファイルパス", () => {
      assert.equal(mockedReadFile.mock.calls[0][0], ".git/refs/heads/master");
    });

    it("返り値", () => {
      assert.equal(actual, "3a3c4ec0ae9589c881029c161dd129bcc318dc08");
    });
  });

  it("refファイルが存在しないとき、nullを返す", async () => {
    // Arrange
    const spyServiceExists = jest
      .spyOn(Service, "exists")
      .mockImplementation(async (_fs, pathname) => false);
    // Act
    const refs = new Refs(".git");
    const actual = await refs.readRef("master");

    // Assert
    assert.equal(actual, null);

    spyServiceExists.mockReset();
  });
});

describe("Refs#updateHead", () => {
  const testRootPath = "/test/project";
  const testOId = "123456789abcdeffedcba98765abcdef12345678";
  describe("ロックファイルがロックされていないとき、HEADを更新する", () => {
    // Arrange
    const mockedWrite = jest.fn();
    const mockedCommit = jest.fn();
    beforeAll(async () => {
      MockedLockfile.mockReset();
      MockedLockfile.mockImplementationOnce((pathname: string) => ({
        holdForUpdate: jest.fn().mockResolvedValue(undefined),
        write: mockedWrite,
        commit: mockedCommit,
      }));
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
    const throwLockDenied = jest.fn().mockImplementation(() => {
      throw new LockDenied();
    });
    beforeAll(async () => {
      MockedLockfile.mockReset();
      MockedLockfile.mockImplementationOnce((pathname: string) => ({
        holdForUpdate: throwLockDenied,
        write: mockedWrite,
        commit: mockedCommit,
      }));
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
