import * as assert from "power-assert";
import { Workspace } from "./workspace";
import { defaultFs } from "./services/FileService";

describe("WorkSpace", () => {
  describe("listFiles", () => {
    it("'.', '..', '.git'以外のファイルを全て返す", async () => {
      // Arrange
      const mockedReaddir = jest
        .fn()
        .mockResolvedValue([".", "..", ".git", "a.txt", "dir"]);

      // Act
      const ws = new Workspace("/test/jit", {
        fs: { ...defaultFs, readdir: mockedReaddir }
      });
      const actual = await ws.listFiles();

      // Assert
      const expected = ["a.txt", "dir"];
      assert.deepEqual(expected, actual);
    });
  });
});
