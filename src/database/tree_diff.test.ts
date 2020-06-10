import * as assert from "power-assert";
import { TreeDiff } from "./tree_diff";
import { Tree } from "./tree";
import { Entry } from "./entry";
import { PathFilter, Trie } from "../path_filter";
import { Commit } from "./commit";
import { GitObject } from "~/types";

function mockDatabase(objects: { [s: string]: GitObject }) {
  return {
    load: jest.fn().mockImplementation(async (oid: string) => {
      return objects[oid];
    }),
  } as any;
}

const commit = (treeOid: string) => new Commit([], treeOid, {} as any, "");

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
      const filter = new PathFilter();
      // Act
      const diff = new TreeDiff(db);
      await diff.compareOids(oid, oid, filter);
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
      const filter = PathFilter.build([]);

      // Act
      const diff = new TreeDiff(db);
      await diff.compareOids(a_oid, b_oid, filter);

      // Assert
      assert.deepEqual(diff.changes.get("hello.txt"), expected);
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
    const filter = new PathFilter(Trie.fromPaths([]));

    // Act
    const diff = new TreeDiff(db);
    await diff.compareOids("3a3c4ec", null, filter);

    // Assert
    assert.deepEqual(diff.changes.get("hello.txt"), [
      new Entry("3a3c4ecaaa", 33188),
      null,
    ]);
  });

  it("aがnull、bのOIDが存在するとき、変更点がある", async () => {
    // Arrange
    const objects = {
      "3a3c4ecbbb": new Tree({
        "hello.txt": new Entry("3a3c4ecaaa", 0o100644),
      }),
    };
    const db = mockDatabase(objects);
    const filter = new PathFilter(Trie.fromPaths([]));

    // Act
    const diff = new TreeDiff(db);
    await diff.compareOids(null, "3a3c4ecbbb", filter);

    // Assert
    assert.deepEqual(diff.changes.get("hello.txt"), [
      null,
      new Entry("3a3c4ecaaa", 33188),
    ]);
  });

  describe("フィルター", () => {
    const three_a = new Entry(
      "17eb192f8d22d50442f606b1a3ddeaec3ee8e08b",
      0o100644
    );
    const two_a = new Entry(
      "b17eb192f8d22d50442f606b1a3ddeaec3ee8e08",
      0o100644
    );
    const two_b = new Entry(
      "4b894fc2fc977ccc2ae8195d1ba60213b1111e48",
      0o100644
    );
    const one_a = new Entry(
      "5436437fa01a7d3e41d46741da54b451446774ca",
      0o100644
    );
    const one_b = new Entry(
      "0a0c575ef52ed277c7d5fea890c0ca5a18d63ed5",
      0o100644
    );
    const objects = {
      "b17eb192-a-nested": new Tree({
        "three.txt": three_a,
      }),
      "b17eb192-a-test": new Tree({
        nested: new Entry("b17eb192-a-nested", 0o40000),
        "two.txt": two_a,
      }),
      "b17eb192-a-root": new Tree({
        test: new Entry("b17eb192-a-test", 0o040000),
        "one.txt": one_a,
      }),
      "b17eb192-b-test": new Tree({
        "two.txt": two_b,
      }),
      "b17eb192-b-root": new Tree({
        test: new Entry("b17eb192-b-test", 0o040000),
        "one.txt": one_b,
      }),
      a: commit("b17eb192-a-root"),
      b: commit("b17eb192-b-root"),
    };

    it.each([
      [
        "パスの指定がないとき、全てのファイルの差分を検出する",
        PathFilter.build([]),
        {
          "test/nested/three.txt": [three_a, null],
          "test/two.txt": [two_a, two_b],
          "one.txt": [one_a, one_b],
        },
      ],
      [
        "ディレクトリが指定されたとき、指定されたディレクトリ内のファイルの差分のみを検出する",
        PathFilter.build(["test/nested"]),
        {
          "test/nested/three.txt": [three_a, null],
        },
      ],
      [
        "ディレクトリが指定されたとき、指定されたディレクトリ内のファイルの差分のみを検出する(複数)",
        PathFilter.build(["test/nested", "one.txt"]),
        {
          "test/nested/three.txt": [three_a, null],
          "one.txt": [one_a, one_b],
        },
      ],
      [
        "範囲が重複するパスが指定されたとき、最も範囲が広いパスが適用される",
        PathFilter.build(["test", "test/nested/three.txt"]),
        {
          "test/nested/three.txt": [three_a, null],
          "test/two.txt": [two_a, two_b],
        },
      ],
    ] as const)("%s", async (_title, filter, expected) => {
      const db = mockDatabase(objects);
      // Act
      const diff = new TreeDiff(db);
      await diff.compareOids("a", "b", filter);

      // Assert
      assert.deepEqual([...diff.changes], Object.entries(expected));
    });
  });
});
