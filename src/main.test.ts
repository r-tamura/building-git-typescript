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
import { IEntry } from "./entry";

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
const MockedIndex = (Index as unknown) as jest.Mock<Partial<Index>>;

jest
  .spyOn(Service, "readTextStream")
  .mockImplementation(() => Promise.resolve("test message"));

const testEnvGlobal: Environment = {
  fs: Service.defaultFs,
  process: defaultProcess,
  date: {
    now: () => new Date(2020, 3, 1),
  },
};

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
  const mockedUpdateHead = jest.fn().mockResolvedValue(undefined);
  const mockedEachEntry = jest.fn().mockReturnValue([
    { name: "bin/exe", parentDirectories: ["bin"], basename: "exe", oid: "1" },
    { name: "mock.txt", parentDirectories: [], basename: "mock.txt", oid: "2" },
    { name: "test.js", parentDirectories: [], basename: "test.js", oid: "3" },
  ] as IEntry[]);
  const mockedLoad = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    jest.clearAllMocks();
    MockedDatabase.mockImplementation((pathname: string) => ({
      store: mockedStore,
    }));
    MockedRefs.mockImplementation((pathname: string) => ({
      updateHead: mockedUpdateHead,
      readHead: jest.fn(),
      headPath: pathname + "/HEAD",
    }));
    MockedIndex.mockImplementationOnce(() => ({
      eachEntry: mockedEachEntry,
      load: mockedLoad,
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
    assert.equal(mockedListFiles.mock.calls.length, 0);
  });

  it("indexの読み込み", () => {
    expect(mockedLoad).toHaveBeenCalledTimes(1);
  });

  it("Database#store", () => {
    expect(Database).toHaveBeenCalledTimes(1);
    assert.equal(mockedStore.mock.calls.length, 3, "tree x2 + commit x1");

    const storingTrees = mockedStore.mock.calls.slice(0, 1);
    const storingCommit = mockedStore.mock.calls[2];
    storingTrees.forEach((call) => {
      assert.equal((call[0] as GitObject).type(), "tree");
    });
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
    MockedDatabase.mockReset();
    MockedDatabase.mockImplementation((pathname: string) => ({
      store: mockedStore,
    }));

    // Act
    await main(["add", "."], testEnvGlobal);
  });
  it("add対象のファイルを読み込む", () => {
    assert.equal(mockedReadFile.mock.calls.length, 2);
    assert.equal(mockedStatFile.mock.calls.length, 2);
  });

  it("indexが更新される", () => {
    assert.equal(MockedIndex.mock.calls.length, 1, "Indexインスタンスの生成");
    const instance = MockedIndex.mock.instances[0];

    const mockedLoadforUpdate = instance.loadForUpdate as jest.Mock;
    assert.equal(
      mockedLoadforUpdate.mock.calls.length,
      1,
      "index更新前にindexファイルを読み込む"
    );

    const mockedAdd = instance.add as jest.Mock;
    const expectedFiles = [
      ["a.txt", "123456789abcdeffedcba98765432112345678", testStats],
      ["b.html", "123456789abcdeffedcba98765432112345678", testStats],
    ];

    expectedFiles.forEach((expected, i) => {
      assert.deepEqual(
        mockedAdd.mock.calls[i],
        expected,
        "最初のadd対象ファイルがindexへ追加"
      );
    });

    const mockedWriteUpdates = instance.writeUpdates as jest.Mock;
    assert.equal(
      mockedWriteUpdates.mock.calls.length,
      1,
      "indexファイルの更新"
    );
  });
});
