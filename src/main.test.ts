import * as assert from "power-assert";
import * as Service from "./services";
import { main, Environment } from "./main";
import { Database } from "./database/database";
import { Refs } from "./refs";
import { GitObject } from "./types";
import { defaultProcess } from "./services";
import { Stats } from "fs";

jest.mock("./database/database");

const mockedListFiles = jest.fn().mockResolvedValue(["a.txt", "b.html"]);
jest.mock("./workspace", () => ({
  Workspace: jest.fn().mockImplementationOnce((pathname: string) => ({
    listFiles: mockedListFiles,
    readFile: jest.fn().mockResolvedValue("hi"),
    statFile: jest.fn().mockResolvedValue(new Stats()),
  })),
}));

jest.mock("./refs");

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

  const MockedDatabase = Database as jest.Mock;
  const MockedRefs = Refs as jest.Mock;
  const mockedStore = jest.fn().mockImplementation(async (o: GitObject) => {
    o.oid = "123456789abcdeffedcba98765432112345678";
  });
  const mockedUpdateHead = jest.fn().mockResolvedValue(null);

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
