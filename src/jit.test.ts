import * as assert from "power-assert";
import * as fs from "fs";

// テストモジュールを読み込むより先にモッキングする
const mkdir = jest.spyOn(fs, "mkdir").mockImplementation(() => {
  return Promise.resolve();
});

import { main } from "./jit";
import { defaultFs } from "./services/FileService";

describe("init", () => {
  // Arrange

  // Act
  let mockedMkdir = jest.fn().mockResolvedValue("");
  beforeAll(async () => {
    await main(["init"], {
      process: { getcwd: jest.fn().mockReturnValue("/test/dir/") },
      fs: { ...defaultFs, mkdir: mockedMkdir }
    });
  });

  // Assert
  it("'objects'ディレクトリを作成する", async () => {
    assert.equal(mockedMkdir.mock.calls[0][0], "/test/dir/.git/objects");
  });

  it("'refs'ディレクトリを作成する", () => {
    assert.equal(mockedMkdir.mock.calls[1][0], "/test/dir/.git/refs");
  });
});
