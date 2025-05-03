import * as path from "path";
import * as assert from "power-assert";
import {
  ascend,
  ascendUnix,
  asOsPath,
  descend,
  descendUnix,
  posixBasename,
  posixDirname,
  posixExtname,
  posixJoin,
  posixPath,
  toOsPath,
  toPathComponentsPosix,
} from "./fs";

const itOnlyPosix = process.platform !== "win32" ? it : it.skip;
const itOnlyWindows = process.platform === "win32" ? it : it.skip;

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

describe("descendUnix", () => {
  it("should split Unix paths correctly", () => {
    // Arrange
    const path = "/home/username/a.txt";
    const expected = ["/home", "/home/username", "/home/username/a.txt"];
    // Act
    const actual = descendUnix(path);
    // Assert
    assert.deepEqual(actual, expected);
  });

  it("should handle relative Unix paths correctly", () => {
    // Arrange
    const path = "username/documents";
    const expected = ["username", "username/documents"];
    // Act
    const actual = descendUnix(path);
    // Assert
    assert.deepEqual(actual, expected);
  });

  it("should throw error for Windows paths", () => {
    // Arrange
    const path = "username\\documents";
    // Act & Assert
    assert.throws(
      () => descendUnix(path),
      /Windows形式のパスはUnix形式に変換できません/,
    );
  });
});

describe("ascendUnix", () => {
  it("should return paths in reverse order compared to descendUnix", () => {
    // Arrange
    const path = "/home/username/a.txt";
    const expected = ["/home/username/a.txt", "/home/username", "/home"];
    // Act
    const actual = ascendUnix(path);
    // Assert
    assert.deepEqual(actual, expected);
  });

  it("should handle relative Unix paths correctly", () => {
    // Arrange
    const path = "username/documents";
    const expected = ["username/documents", "username"];
    // Act
    const actual = ascendUnix(path);
    // Assert
    assert.deepEqual(actual, expected);
  });
});

describe("ascend", () => {
  itOnlyPosix("should return paths in reverse order of descend", () => {
    // Arrange
    const path = "test/repo";
    const expected = ["test/repo", "test"];
    // Act
    const actual = ascend(path);
    // Assert
    assert.deepEqual(actual, expected);
  });
});

describe("toPathComponentsPosix", () => {
  it("should split path into components", () => {
    // Arrange
    const path = posixPath("/usr/bin/ruby");
    const expected = ["", "usr", "bin", "ruby"];
    // Act
    const actual = toPathComponentsPosix(path);
    // Assert
    assert.deepEqual(actual, expected);
  });

  it("should handle relative paths", () => {
    // Arrange
    const path = posixPath("usr/local/bin");
    const expected = ["usr", "local", "bin"];
    // Act
    const actual = toPathComponentsPosix(path);
    // Assert
    assert.deepEqual(actual, expected);
  });
});

describe("posixPath", () => {
  it("should keep Unix paths unchanged", () => {
    // Arrange
    const unixPath = "/home/user/file.txt";
    // Act
    const result = posixPath(unixPath);
    // Assert
    assert.strictEqual(result, unixPath);
  });

  it("should convert Windows paths to Unix format", () => {
    // Arrange
    const winPath = "user\\documents\\file.txt";
    const expected = "user/documents/file.txt";
    // Act
    const result = posixPath(winPath);
    // Assert
    assert.strictEqual(result, expected);
  });

  it("should handle Windows paths with drive letters", () => {
    // Arrange
    const winPath = "C:\\Users\\name\\file.txt";
    const expected = "/Users/name/file.txt";
    // Act
    const result = posixPath(winPath);
    // Assert
    assert.strictEqual(result, expected);
  });
});

describe("posixJoin", () => {
  it("should join paths using forward slashes", () => {
    // Arrange
    const paths = ["usr", "local", "bin"];
    const expected = "usr/local/bin";
    // Act
    const result = posixJoin(...paths);
    // Assert
    assert.strictEqual(result, expected);
  });

  it("should handle mixed path formats", () => {
    // Arrange
    const paths = ["usr", "local\\bin", "app"];
    const expected = "usr/local/bin/app";
    // Act
    const result = posixJoin(...paths);
    // Assert
    assert.strictEqual(result, expected);
  });
});

describe("posix path operations", () => {
  describe("posixDirname", () => {
    it("should return the directory name of a path", () => {
      // Arrange
      const path = posixPath("/home/user/file.txt");
      const expected = "/home/user";
      // Act
      const result = posixDirname(path);
      // Assert
      assert.strictEqual(result, expected);
    });
  });

  describe("posixBasename", () => {
    it("should return the base name of a path", () => {
      // Arrange
      const path = posixPath("/home/user/file.txt");
      const expected = "file.txt";
      // Act
      const result = posixBasename(path);
      // Assert
      assert.strictEqual(result, expected);
    });

    it("should remove the extension when specified", () => {
      // Arrange
      const path = posixPath("/home/user/file.txt");
      const expected = "file";
      // Act
      const result = posixBasename(path, ".txt");
      // Assert
      assert.strictEqual(result, expected);
    });
  });

  describe("posixExtname", () => {
    it("should return the extension of a file", () => {
      // Arrange
      const path = posixPath("/home/user/file.txt");
      const expected = ".txt";
      // Act
      const result = posixExtname(path);
      // Assert
      assert.strictEqual(result, expected);
    });

    it("should return empty string for paths without extension", () => {
      // Arrange
      const path = posixPath("/home/user/file");
      const expected = "";
      // Act
      const result = posixExtname(path);
      // Assert
      assert.strictEqual(result, expected);
    });
  });
});

describe("toOsPath", () => {
  it("should convert Posix path to OS path", () => {
    // Arrange
    const posixStylePath = posixPath("/home/user/file.txt");
    const separator = path.sep;
    // Act
    const result = toOsPath(posixStylePath);
    // Assert
    assert.strictEqual(result.includes(separator), true);
    assert.strictEqual(result.includes("/"), separator === "/");
  });

  it("should throw for Windows path input", () => {
    // Skip test on Windows as we can't create valid Windows paths for testing
    // without triggering the assertion
    if (process.platform === "win32") {
      return;
    }

    // Arrange
    const windowsStylePath = "C:\\Users\\name\\file.txt";
    // Act & Assert
    assert.throws(
      () => toOsPath(windowsStylePath),
      /アプリケーション内部ではPosix形式パスを利用してください/,
    );
  });
});

describe("asOsPath", () => {
  it("should accept paths matching current OS format", () => {
    // Arrange
    const osPath = path.join("user", "documents", "file.txt");
    // Act & Assert
    assert.doesNotThrow(() => asOsPath(osPath));
  });

  it("should reject paths not matching current OS format", () => {
    // Arrange
    const nonOsPath =
      process.platform === "win32"
        ? "user/documents/file.txt" // Unix path on Windows
        : "user\\documents\\file.txt"; // Windows path on Unix
    // Act & Assert
    assert.throws(() => asOsPath(nonOsPath), /OS形式のパスを利用してください/);
  });
});
