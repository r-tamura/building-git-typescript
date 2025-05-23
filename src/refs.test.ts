import * as os from "os";
import * as path from "path";
import * as assert from "power-assert";
import { mockFs, mockFsError } from "./__test__";
import { Lockfile } from "./lockfile";
import { Environment, InvalidBranch, LockDenied, Refs, symref } from "./refs";
import { defaultFs, FileService } from "./services";
import * as Service from "./services/FileService";

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
      ["ASCII制御文字を含む(DEL)", "a\u007F"],
      ["'^'を含む", "branch^"],
      ["' '(SP)を含む", "a b"],
    ])("%s", async (_title, branchName) => {
      const refs = new Refs(".git");
      // Act & Assert
      await expect(refs.createBranch(branchName, "3a3c4ec")).rejects.toThrow(
        InvalidBranch,
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

    alreadyExists.mockRestore();
  });
});

describe("Refs#deleteBranch", () => {
  it("削除したファイルのOIDを返す", async () => {
    // Arrange
    const oid = "3a3c4ec0ae9589c881029c161dd129bcc318dc08";
    const unlink = jest.fn().mockResolvedValue(null);
    const rm = jest.fn().mockResolvedValue(null);
    const env = mockEnv({
      readFile: jest.fn().mockResolvedValueOnce(oid),
      unlink,
      rm,
    });

    // Act
    const refs = new Refs(".git", env);
    const actual = await refs.deleteBranch("topic");

    // Assert
    assert.equal(
      unlink.mock.calls[0][0],
      path.join(".git", "refs", "heads", "topic"),
      "ブランチRefファイルの削除",
    );
    assert.equal(
      rm.mock.calls[0][0],
      path.join(".git", "refs", "heads"),
      "ブランチが無くなったとき、/refs/headsディレクトリを削除",
      );
    assert.equal(actual, oid, "返り値");
  });

  it("symrefが解決できなかったとき、例外を発生させる", async () => {
    // Arrange
    const readFile = jest.fn().mockImplementation(mockFsError("ENOENT"));
    const env = mockEnv({
      readFile,
      unlink: jest.fn().mockResolvedValue(null),
      rm: jest.fn().mockResolvedValue(null),
    });

    // Act
    const refs = new Refs(".git", env);
    const actual = refs.deleteBranch("topic");

    // Assert
    await expect(actual).rejects.toThrow(InvalidBranch);
  });
});

describe("Refs#listBranch", () => {
  it("headsディレクトリ内のブランチを取得する", async () => {
    // Arrange
    const spyDirectory = jest
      .spyOn(Service, "directory")
      .mockResolvedValue(false);
    const readdir = jest.fn().mockResolvedValueOnce(["foo", "bar", "qux"]);
    const env: Environment = mockEnv({ readdir });
    // Act
    const refs = new Refs(".git", env);
    const actual = await refs.listBranches();

    // Assert
    assert.equal(
      readdir.mock.calls[0][0],
      path.join(".git", "refs", "heads"),
      "headsディレクトリ",
    );

    assert.deepEqual(
      actual,
      [
        symref(refs, "refs/heads/foo"),
        symref(refs, "refs/heads/bar"),
        symref(refs, "refs/heads/qux"),
      ],
      "返り値",
    );

    spyDirectory.mockRestore();
  });

  it("headsディレクトリが存在しないとき、空のリストを返す", async () => {
    // Arrange
    const readdir = jest.fn().mockImplementationOnce(mockFsError("ENOENT"));
    const env: Environment = mockEnv({ readdir });

    // Act
    const refs = new Refs(".git", env);
    const actual = await refs.listBranches();

    // Assert
    assert.deepEqual(actual, []);
  });
});

describe("Refs#readHead", () => {
  const testRootPath = "/test/project";
  it("HEADファイルが存在するとき、HEADファイルのデータを返す", async () => {
    // Arrange
    const mockedReadFile = jest
      .fn()
      .mockResolvedValueOnce("ref: refs/heads/master\n")
      .mockResolvedValueOnce("3a3c4ec\n");
    const env = {
      fs: { ...Service.defaultFs, readFile: mockedReadFile },
    };

    // Act
    const refs = new Refs(testRootPath, env);
    const actual = await refs.readHead();

    // Assert
    assert.equal(actual, "3a3c4ec");
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
          pathname.includes("heads"),
        );
      const env = mockEnv({ readFile: mockedReadFile });

      // Act
      const refs = new Refs(".git", env);
      actual = await refs.readRef("master");
    });

    afterAll(() => {
      spyServiceExists.mockRestore();
    });    it("ファイルパス", () => {
      // OS依存パスでOK
      assert.equal(
        mockedReadFile.mock.calls[0][0],
        path.join(".git", "refs", "heads", "master")
      );
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

    spyServiceExists.mockRestore();
  });
});

describe("reverseRefs", () => {
  it("HEADと唯一のブランチを返す", async () => {    // Arrange
    const oid = "3a3c4ec";
    const env = mockEnv(mockFs({
      [path.join(".git", "refs")]: ["heads"],
      [path.join(".git", "refs", "heads")]: ["master"],
    }, {
      [path.join(".git", "HEAD")]: "ref: refs/heads/master",
      [path.join(".git", "refs", "heads", "master")]: oid,
    }));

    // Act
    const refs = new Refs(".git", env);
    const actual = await refs.reverseRefs();

    // Assert
    assert.equal(actual.get(oid)?.length, 2);
    assert.equal(actual.get(oid)?.[0]?.path, "HEAD");
  });
});

describe("Refs#shortName", () => {
  it("headsディレクトリにrefファイルがあるとき、ref名を返す", () => {
    // Act
    const refs = new Refs(".git");
    const actual = refs.shortName("refs/heads/bar");

    // Assert
    assert.equal(actual, "bar");
  });

  it(".gitディレクトリにrefファイルがあるとき、ref名を返す", () => {
    const refs = new Refs(".git");
    const actual = refs.shortName("bar");

    assert.equal(actual, "bar");
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
      MockedLockfile.mockRestore();
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
      assert.equal(calls[1][0], os.EOL);
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
      MockedLockfile.mockRestore();
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

describe("Refs#updateRef", () => {
  const testRootPath = "/test/project";
  const testOId = "123456789abcdeffedcba98765abcdef12345678";
  const mockedWrite = jest.fn();
  const mockedCommit = jest.fn();
  const mockedRollback = jest.fn();
  describe("refを更新する", () => {
    beforeAll(async () => {
      MockedLockfile.mockRestore();
      MockedLockfile.mockImplementationOnce((pathname: string) => ({
        holdForUpdate: () => Promise.resolve(),
        write: mockedWrite,
        commit: mockedCommit,
        rollback: mockedRollback,
      }));
      const refs = new Refs(testRootPath);
      await refs.updateRef("/heads/master", testOId);
    });

    it("refが更新される", async () => {
      assert.equal(testOId, mockedWrite.mock.calls[0][0]);
    });
  });

  describe("refを削除する", () => {
    const mockedEnv = mockEnv({
      unlink: jest.fn().mockResolvedValueOnce(null),
    });
    beforeAll(async () => {
      MockedLockfile.mockRestore();
      MockedLockfile.mockImplementationOnce(() => ({
        holdForUpdate: jest.fn().mockResolvedValueOnce(null),
        write: mockedWrite,
        commit: mockedCommit,
        rollback: mockedRollback,
      }));
      const refs = new Refs(testRootPath, mockedEnv);
      await refs.updateRef("heads/master", null);
    });    it("refが削除される", () => {
      assert.equal(
        (mockedEnv.fs.unlink as jest.Mock).mock.calls[0][0],
        path.join(testRootPath, "heads", "master"),
        "削除されたパス"
      );
    });

    it("lockfileが削除される", () => {
      assert.equal(1, mockedRollback.mock.calls.length);
    });
  });
});
