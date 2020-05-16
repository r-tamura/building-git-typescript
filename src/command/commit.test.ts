import * as assert from "power-assert";
import * as Service from "../services";
import { IEntry } from "../entry";
import { GitObject, Environment } from "../types";
import { Commit as DBCommit } from "../database/commit";
import { defaultProcess } from "../services";
import { makeTestStats } from "../__test__";
import { makeLogger } from "../__test__/util";
import { Commit } from "./commit";
import { Stream } from "stream";
import { Author } from "../database";
import { Repository } from "../repository";

jest.mock("../database/commit");
jest.mock("../repository");

const testStats = makeTestStats();

// Database
const mockedStore = jest.fn().mockImplementation(async (o: GitObject) => {
  o.oid = "123456789abcdeffedcba98765432112345678";
});
// Workspace
const mockedListFiles = jest.fn().mockResolvedValue(["a.txt", "b.html"]);
const mockedReadFile = jest.fn().mockResolvedValue("hi");
const mockedStatFile = jest.fn().mockResolvedValue(testStats);
// Refs
const mockedUpdateHead = jest.fn().mockResolvedValue(undefined);
// Index
const mockedEachEntry = jest.fn().mockReturnValue([
  { name: "bin/exe", parentDirectories: ["bin"], basename: "exe", oid: "1" },
  { name: "mock.txt", parentDirectories: [], basename: "mock.txt", oid: "2" },
  { name: "test.js", parentDirectories: [], basename: "test.js", oid: "3" },
] as IEntry[]);
const mockedLoad = jest.fn().mockResolvedValue(undefined);

const MockedRepo = (Repository as unknown) as jest.Mock<any>;

MockedRepo.mockImplementation((pathname: string) => ({
  database: {
    store: mockedStore,
  },
  refs: {
    readHead: jest.fn().mockImplementation(async () => {
      return "73f5092ce31a05a69ed5ae13a01b963808776923";
    }),
    updateHead: mockedUpdateHead,
    headPath: pathname + "/HEAD",
  },
  workspace: {
    listFiles: mockedListFiles,
    readFile: mockedReadFile,
    statFile: mockedStatFile,
  },
  index: {
    eachEntry: mockedEachEntry,
    load: mockedLoad,
  },
}));

const MockedCommit = (DBCommit as unknown) as jest.Mock<Partial<DBCommit>>;

describe("commit", () => {
  // Arrange
  const mockedMkdir = jest.fn().mockResolvedValue("");
  const mockedCwd = jest.fn().mockReturnValue("/test/dir/");
  const mockedWrite = jest.fn();

  let cmd: Commit;
  beforeAll(async () => {
    jest.clearAllMocks();
    const input = Stream.Readable.from("test message");
    const env: Environment = {
      fs: {
        ...Service.defaultFs,
        mkdir: mockedMkdir,
        write: mockedWrite,
      },
      logger: makeLogger(),
      process: {
        ...defaultProcess,
        stdin: input as any,
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
    const cmd = new Commit([], env);
    await cmd.execute();
  });

  it("Workspace#listFiles", () => {
    assert.equal(mockedListFiles.mock.calls.length, 0);
  });

  it("indexの読み込み", () => {
    expect(mockedLoad).toHaveBeenCalledTimes(1);
  });

  it("Database#store", () => {
    assert.equal(mockedStore.mock.calls.length, 3, "tree x2 + commit x1");

    const storingTrees = mockedStore.mock.calls.slice(0, 1);
    storingTrees.forEach((call) => {
      assert.equal((call[0] as GitObject).type, "tree");
    });

    assert.equal(MockedCommit.mock.calls.length, 1, "commit objectの生成");
    assert.deepEqual(MockedCommit.mock.calls[0], [
      "73f5092ce31a05a69ed5ae13a01b963808776923",
      "123456789abcdeffedcba98765432112345678",
      new Author("John Doe", "johndoe@test.local", new Date(2020, 3, 1)),
      "test message",
    ]);
  });

  it("Update HEAD", () => {
    assert.equal(mockedUpdateHead.mock.calls.length, 1);
    const call = mockedUpdateHead.mock.calls[0];
    assert.equal(call[0], "123456789abcdeffedcba98765432112345678");
  });
});
