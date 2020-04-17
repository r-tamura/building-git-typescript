import * as assert from "power-assert";
import { main } from "../main";
import { Environment } from "../types";
import * as Service from "../services";
import { defaultProcess } from "../services";

jest.mock("../database/database");
jest.mock("../gindex");
jest.mock("../refs");
jest.mock("../workspace");

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
