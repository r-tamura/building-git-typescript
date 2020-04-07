import * as assert from "power-assert";
import { defaultFs } from "./services/FileService";
import { main, Environment } from "./jit";

import { Database } from "./database";
import { GitObject } from "./types";

jest.mock("./database");

const mockedListFiles = jest.fn().mockResolvedValue(["a.txt", "b.html"]);
jest.mock("./workspace", () => ({
  Workspace: jest.fn().mockImplementationOnce((pathname: string) => ({
    listFiles: mockedListFiles,
    readFile: jest.fn().mockResolvedValue("hi")
  }))
}));

describe("init", () => {
  const mockedMkdir = jest.fn().mockResolvedValue("");
  const mockedCwd = jest.fn().mockReturnValue("/test/dir/");
  beforeAll(async () => {
    // Arrange
    const env: Environment = {
      fs: { ...defaultFs, mkdir: mockedMkdir },
      process: {
        getcwd: mockedCwd
      }
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

  const MockedDatabase = Database as jest.Mock;
  const mockedStore = jest.fn().mockImplementation(async (o: GitObject) => {
    o.oid = "123456789abcdeffedcba98765432112345678";
  });

  beforeAll(async () => {
    MockedDatabase.mockImplementation((pathname: string) => ({
      store: mockedStore
    }));

    const env: Environment = {
      fs: { ...defaultFs, mkdir: mockedMkdir },
      process: {
        getcwd: mockedCwd
      }
    };
    //Act
    await main(["commit"], env);
  });

  it("Workspace#listFiles", () => {
    assert.equal(mockedListFiles.mock.calls.length, 1);
  });

  it("Database#store", () => {
    expect(Database).toHaveBeenCalledTimes(1);
    assert.equal(mockedStore.mock.calls.length, 3, "blob x2 + tree x1");

    const callsExceptLast = mockedStore.mock.calls.slice(0, -1);
    const lastCall = mockedStore.mock.calls[callsExceptLast.length];
    callsExceptLast.forEach(call => {
      assert.equal((call[0] as GitObject).type(), "blob");
      assert.equal((call[0] as GitObject).toString(), "hi");
    });

    assert.equal((lastCall[0] as GitObject).type(), "tree");
  });
});
