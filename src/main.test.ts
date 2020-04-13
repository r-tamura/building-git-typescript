import * as assert from "power-assert";
import * as Service from "./services";
import { main, Environment } from "./main";
import { Database } from "./database/database";
import { Refs } from "./refs";
import { GitObject } from "./types";
import { Index } from "./gindex";
import { defaultProcess } from "./services";
import { makeTestStats } from "./__test__";
import { Workspace } from "./workspace";

const mockedStore = jest.fn().mockImplementation(async (o: GitObject) => {
  o.oid = "123456789abcdeffedcba98765432112345678";
});
jest.mock("./database/database");
const MockedDatabase = Database as jest.Mock;

const testStats = makeTestStats();
const mockedListFiles = jest.fn().mockResolvedValue(["a.txt", "b.html"]);
const mockedReadFile = jest.fn().mockResolvedValue("hi");
const mockedStatFile = jest.fn().mockResolvedValue(testStats);
jest.mock("./workspace", () => ({
  Workspace: jest.fn().mockImplementation((pathname: string) => ({
    listFiles: mockedListFiles,
    readFile: mockedReadFile,
    statFile: mockedStatFile,
  })),
}));
const MockedWs = Workspace as jest.Mock<Workspace>;

jest.mock("./refs");
const MockedRefs = Refs as jest.Mock;
jest.mock("./gindex");
const MockedIndex = Index as jest.Mock<Index>;

jest
  .spyOn(Service, "readTextStream")
  .mockImplementation(() => Promise.resolve("test message"));

describe("init", () => {
  const mockedMkdir = jest.fn().mockResolvedValue("");
  const mockedCwd = jest.fn().mockReturnValue("/test/dir/");
  beforeAll(async () => {
    // Arrange
    const env: Environment = {
      fs: { ...Service.defaultFs, mkdir: mockedMkdir },
      process: {
        ...defaultProcess,
        cwd: mockedCwd,
      },
      date: {
        now: () => new Date(2020, 3, 1),
      },
    };

    // Act
    await main(["init"], env);
  });

  // Assert
  it("'objects'ディレクトリを作成する", async () => {
    assert.equal(mockedMkdir.mock.calls[0][0], "/test/dir/.git/objects");
  });

  it("'refs'ディレクトリを作成する", () => {
    assert.equal(mockedMkdir.mock.calls[1][0], "/test/dir/.git/refs");
  });
});

describe("commit", () => {
  // Arrange
  const mockedMkdir = jest.fn().mockResolvedValue("");
  const mockedCwd = jest.fn().mockReturnValue("/test/dir/");
  const mockedWrite = jest.fn();
  const mockedUpdateHead = jest.fn().mockResolvedValue(null);

  beforeAll(() => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    MockedDatabase.mockImplementation((pathname: string) => ({
      store: mockedStore,
    }));
    MockedRefs.mockImplementation((pathname: string) => ({
      updateHead: mockedUpdateHead,
      readHead: jest.fn(),
      headPath: pathname + "/HEAD",
    }));

    const env: Environment = {
      fs: {
        ...Service.defaultFs,
        mkdir: mockedMkdir,
        write: mockedWrite,
      },
      process: {
        ...defaultProcess,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "John Doe",
          GIT_AUTHOR_EMAIL: "johndoe@test.local",
        },
        cwd: mockedCwd,
      },
      date: {
        now: () => new Date(2020, 3, 1),
      },
    };
    //Act
    await main(["commit"], env);
  });

  it("Workspace#listFiles", () => {
    assert.equal(mockedListFiles.mock.calls.length, 1);
  });

  it("Database#store", () => {
    expect(Database).toHaveBeenCalledTimes(1);
    assert.equal(
      mockedStore.mock.calls.length,
      4,
      "blob x2 + tree x1 + commit x1"
    );

    const blobCalls = mockedStore.mock.calls.slice(0, -2);
    const storingTree = mockedStore.mock.calls[2];
    const storingCommit = mockedStore.mock.calls[3];
    blobCalls.forEach((call) => {
      assert.equal((call[0] as GitObject).type(), "blob");
      assert.equal((call[0] as GitObject).toString(), "hi");
    });

    assert.equal((storingTree[0] as GitObject).type(), "tree");

    assert.equal((storingCommit[0] as GitObject).type(), "commit");
  });

  it("Update HEAD", () => {
    assert.equal(MockedRefs.mock.calls.length, 1);
    assert.equal(mockedUpdateHead.mock.calls.length, 1);
    const call = mockedUpdateHead.mock.calls[0];
    assert.equal(call[0], "123456789abcdeffedcba98765432112345678");
  });
});

describe("add", () => {
  beforeAll(() => {
    jest.clearAllMocks();
  });
  beforeAll(async () => {
    // Arrange
    const env: Environment = {
      fs: Service.defaultFs,
      process: defaultProcess,
      date: {
        now: () => new Date(2020, 3, 1),
      },
    };
    MockedDatabase.mockImplementation((pathname: string) => ({
      store: mockedStore,
    }));

    // Act
    await main(["add", "README.md"], env);
  });
  it("add対象のファイルを読み込む", () => {
    assert.equal(mockedReadFile.mock.calls.length, 1);
    assert.equal(mockedStatFile.mock.calls.length, 1);
  });

  it("indexが更新される", () => {
    assert.equal(MockedIndex.mock.calls.length, 1, "Indexインスタンスの生成");

    const instance = MockedIndex.mock.instances[0];
    const mockedAdd = instance.add as jest.Mock;
    assert.deepEqual(
      mockedAdd.mock.calls[0],
      ["README.md", "123456789abcdeffedcba98765432112345678", testStats],
      "add対象ファイルがindexへ追加"
    );

    const mockedWriteUpdates = instance.writeUpdates as jest.Mock;
    assert.equal(
      mockedWriteUpdates.mock.calls.length,
      1,
      "indexファイルの更新"
    );
  });
});
