import * as assert from "power-assert";
import { TreeDiff } from "./tree_diff";
import { Tree } from "./tree";
import { Entry } from "./entry";

describe("TreeDiff#compareOids", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("a/bが同じOIDのとき、変更点はない", () => {
    it.each([
      ["null", null],
      ["oid", "3a3c4ec"],
    ])("%s", async (_title, oid) => {
      // Arrange
      const db: any = {};
      // Act
      const diff = new TreeDiff(db);
      await diff.compareOids(oid, oid);
      // Assert
      assert.deepEqual(diff.changes, new Map());
    });
  });

  describe("a/bが異なるOIDのとき、変更点がある", () => {
    it.each([
      [
        "modeが異なる",
        "3a3c4ecaaa",
        new Tree({
          "hello.txt": new Entry("3a3c4ecxxx", 0o0100644),
        }),
        "3a3c4ecbbb",
        new Tree({
          "hello.txt": new Entry("3a3c4ecxxx", 0o0100755),
        }),
        [
          new Entry("3a3c4ecxxx", 0o0100644),
          new Entry("3a3c4ecxxx", 0o0100755),
        ],
      ],
      [
        "contentsが異なる",
        "3a3c4ecaaa",
        new Tree({
          "hello.txt": new Entry("3a3c4ecxxx", 0o0100644),
        }),
        "3a3c4ecbbb",
        new Tree({
          "hello.txt": new Entry("3a3c4ecyyy", 0o0100644),
        }),
        [
          new Entry("3a3c4ecxxx", 0o0100644),
          new Entry("3a3c4ecyyy", 0o0100644),
        ],
      ],
    ])("%s", async (_title, a_oid, a_tree, b_oid, b_tree, expected) => {
      // Arrange
      const mockedLoad = jest
        .fn()
        .mockResolvedValueOnce(a_tree)
        .mockResolvedValueOnce(b_tree);
      const db = {
        load: mockedLoad,
      } as any;

      // Act
      const diff = new TreeDiff(db);
      await diff.compareOids(a_oid, b_oid, "test/prefix");

      // Assert
      assert.deepEqual(diff.changes.get("test/prefix/hello.txt"), expected);
    });
  });

  it("aのOIDが存在し、bがnullのとき、変更点がある", async () => {
    // Arrange
    const tree = new Tree({
      "hello.txt": new Entry("3a3c4ecaaa", 0o0100644),
    });
    const mockedLoad = jest.fn().mockResolvedValueOnce(tree);
    const db = {
      load: mockedLoad,
    } as any;

    // Act
    const diff = new TreeDiff(db);
    await diff.compareOids("3a3c4ec", null, "test/prefix");

    // Assert
    assert.deepEqual(diff.changes.get("test/prefix/hello.txt"), [
      new Entry("3a3c4ecaaa", 33188),
      null,
    ]);
  });

  it("aがnull、bのOIDが存在するとき、変更点がある", async () => {
    // Arrange
    const tree = new Tree({
      "hello.txt": new Entry("3a3c4ecaaa", 0o0100644),
    });
    const mockedLoad = jest.fn().mockResolvedValueOnce(tree);
    const db = {
      load: mockedLoad,
    } as any;

    // Act
    const diff = new TreeDiff(db);
    await diff.compareOids(null, "3a3c4ec", "test/prefix");

    // Assert
    assert.deepEqual(diff.changes.get("test/prefix/hello.txt"), [
      null,
      new Entry("3a3c4ecaaa", 33188),
    ]);
  });
});
