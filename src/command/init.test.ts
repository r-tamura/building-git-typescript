import * as assert from "power-assert";
import { Init } from "./init";
import { Environment } from "../types";
import * as Service from "../services";
import { defaultProcess } from "../services";
import { makeLogger } from "../__test__/util";

jest.mock("../database/database");
jest.mock("../gindex");
jest.mock("../refs");
jest.mock("../workspace");

describe("init", () => {
  const mockedMkdir = jest.fn().mockResolvedValue("");
  const mockedCwd = jest.fn().mockReturnValue("/test/dir/");
  let cmd: Init;
  beforeAll(async () => {
    // Arrange
    const env: Environment = {
      fs: { ...Service.defaultFs, mkdir: mockedMkdir },
      logger: makeLogger(),
      process: {
        ...defaultProcess,
        cwd: mockedCwd,
      },
      date: {
        now: () => new Date(2020, 3, 1),
      },
    };

    // Act
    cmd = new Init([], env);
    await cmd.execute();
  });

  // Assert
  it("'objects'ディレクトリを作成する", async () => {
    assert.equal(mockedMkdir.mock.calls[0][0], "/test/dir/.git/objects");
  });

  it("'refs/heads'ディレクトリを作成する", () => {
    assert.equal(mockedMkdir.mock.calls[1][0], "/test/dir/.git/refs/heads");
  });
});
