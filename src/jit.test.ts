import * as assert from "power-assert";
import { defaultFs } from "./services/FileService";
import { main, Environment } from "./jit";

import { Workspace } from "./workspace";
import { Database } from "./database";
import { Blob } from "./blob";

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

  beforeAll(() => {
    const env: Environment = {
      fs: { ...defaultFs, mkdir: mockedMkdir },
      process: {
        getcwd: mockedCwd
      }
    };
    //Act
    main(["commit"], env);
  });

  it("Workspace#listFiles", () => {
    assert.equal(mockedListFiles.mock.calls.length, 1);
  });

  it("Database#store", () => {
    expect(Database).toHaveBeenCalled();
    const MockedDatabase = Database as jest.Mock<Database>;
    const store = MockedDatabase.mock.instances[0].store;
    const mockedStore = store as jest.Mock<typeof store>;
    assert.equal(mockedStore.mock.calls.length, 2);

    mockedStore.mock.calls.forEach(call => {
      assert.equal((call[0] as Blob).toString(), "hi");
    });
  });
});
