import * as assert from "power-assert";
import { main } from "../main";
import * as Service from "../services";
import { IEntry } from "../entry";
import { Refs } from "../refs";
import { GitObject, Environment } from "../types";
import { Database } from "../database/database";
import { Index } from "../gindex";
import { defaultProcess } from "../services";
import { Workspace } from "../workspace";
import { makeTestStats } from "../__test__";

const mockedStore = jest.fn().mockImplementation(async (o: GitObject) => {
  o.oid = "123456789abcdeffedcba98765432112345678";
});
jest.mock("../database/database");
jest.mock("../gindex");
jest.mock("../refs");
jest.mock("../workspace");

const MockedDatabase = Database as jest.Mock;

const testStats = makeTestStats();
const mockedListFiles = jest.fn().mockResolvedValue(["a.txt", "b.html"]);
const mockedReadFile = jest.fn().mockResolvedValue("hi");
const mockedStatFile = jest.fn().mockResolvedValue(testStats);

const MockedWs = (Workspace as unknown) as jest.Mock<Partial<Workspace>>;
MockedWs.mockImplementation(() => ({
  listFiles: mockedListFiles,
  readFile: mockedReadFile,
  statFile: mockedStatFile,
}));
const MockedRefs = Refs as jest.Mock;
const MockedIndex = (Index as unknown) as jest.Mock<Partial<Index>>;

jest
  .spyOn(Service, "readTextStream")
  .mockImplementation(() => Promise.resolve("test message"));

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
    MockedDatabase.mockImplementation(() => ({
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
