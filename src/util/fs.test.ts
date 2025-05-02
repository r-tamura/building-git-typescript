import * as assert from "power-assert";
import { descend } from "./fs";

describe("descend", () => {
  // Windows環境のテスト
  describe("Windows環境のテスト", () => {
    // Jest provides platform-specific conditionals
    const isWindows = process.platform === "win32";

    // Skip entire describe block if not on Windows
    beforeAll(() => {
      if (!isWindows) {
        console.log("Skipping Windows-specific tests on non-Windows platform");
      }
    });

    // Use conditional test helpers from Jest
    const test = isWindows ? it : it.skip;

    test("Windowsパスを分解して、親ディレクトリのパスを取得する", () => {
      // Arrange
      const path = "test\\repo";
      const expected = ["test", "test\\repo"];
      // Act
      const actual = descend(path);
      // Assert
      assert.deepEqual(actual, expected);
    });

    test("Windows環境の複数階層のパスを分解して、親ディレクトリのパスを取得する", () => {
      // Arrange
      const path = "test\\repo\\nested";
      const expected = ["test", "test\\repo", "test\\repo\\nested"];
      // Act
      const actual = descend(path);
      // Assert
      assert.deepEqual(actual, expected);
    });
  });

  // POSIX環境のテスト
  describe("POSIX環境のテスト", () => {
    const isPosix = process.platform !== "win32";

    beforeAll(() => {
      if (!isPosix) {
        console.log("Skipping POSIX-specific tests on Windows platform");
      }
    });

    const test = isPosix ? it : it.skip;

    test("POSIXパスを分解して、親ディレクトリのパスを取得する", () => {
      // Arrange
      const path = "test/repo";
      const expected = ["test", "test/repo"];
      // Act
      const actual = descend(path);
      // Assert
      assert.deepEqual(actual, expected);
    });
  });
});