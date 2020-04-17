import { join } from "path";
import * as assert from "power-assert";
import { Workspace, MissingFile } from "./workspace";
import { defaultFs } from "./services";
import { Stats } from "fs";
import { ENOENT } from "./__test__";

jest.mock("fs");

type FakeFile = {
  type: "f";
  name: string;
};

type FakeDir = {
  type: "d";
  name: string;
  items: FakeEntry[];
};

type FakeEntry = FakeFile | FakeDir;

const fakeDirectory: FakeDir = {
  type: "d",
  name: "root",
  items: [
    {
      type: "d",
      name: "test",
      items: [
        { type: "f", name: "." },
        { type: "f", name: ".." },
        { type: "d", name: ".git", items: [{ type: "f", name: "HEAD" }] },
        { type: "f", name: "world.txt" },
        { type: "f", name: "hello.txt" },
        {
          type: "d",
          name: "dir_a",
          items: [
            { type: "f", name: "." },
            { type: "f", name: ".." },
            { type: "d", name: ".git", items: [{ type: "f", name: "HEAD" }] },
            { type: "f", name: "world_a.txt" },
            { type: "f", name: "hello_a.txt" },
          ],
        },
        {
          type: "d",
          name: "dir_b",
          items: [
            { type: "f", name: "hello_b.txt" },
            { type: "d", name: "dir_b_a", items: [] as any[] },
          ],
        },
      ],
    },
  ],
};

const retrieve = (pathname: string): FakeEntry => {
  let entry: FakeEntry = fakeDirectory;
  let seen = "";
  for (const name of pathname.split("/").filter((name) => name !== "")) {
    if (entry.type === "f") {
      return entry;
    }
    const item: FakeEntry[] = entry.items.filter((e) => e.name === name);
    // assert.equal(item.length, 1, "Not found: " + join(seen, name));

    if (item.length === 0) {
      throw ENOENT;
    }

    entry = item[0];
    seen = join(seen, item[0].name);
  }
  return entry;
};

const fakeReaddir = jest
  .fn<Promise<any[]>, any>()
  .mockImplementation(async (pathname: string) => {
    const entry = retrieve(pathname);
    if (entry.type === "f") {
      throw new TypeError(`${pathname} is not a directory.`);
    }
    const names = entry.items.map((item) => item.name);
    return names;
  });

const fakeStat = jest
  .fn<Promise<Stats>, [any]>()
  .mockImplementation(async (pathname) => {
    ((Stats as unknown) as jest.Mock<Partial<Stats>>).mockImplementation(
      () => ({
        isDirectory: jest.fn().mockReturnValue(retrieve(pathname).type === "d"),
      })
    );
    return new Stats();
  });

describe("WorkSpace#listFiles", () => {
  const testPath = "test";
  const env = {
    fs: {
      ...defaultFs,
      readdir: fakeReaddir,
      stat: fakeStat,
      access: jest.fn().mockResolvedValue(undefined),
    },
  };

  it("ファイルが指定されたとき、そのファイルのみを要素とするリストを返す", async () => {
    // Arrange

    // Act
    const ws = new Workspace(testPath, env);
    const actual = await ws.listFiles("test/world.txt");

    // Assert
    const expected = ["world.txt"];
    assert.deepEqual(actual, expected);
  });

  it("'.', '..', '.git'以外のファイルを全て返す", async () => {
    // Act
    const ws = new Workspace(testPath, env);
    const actual = await ws.listFiles("test/dir_a");

    // Assert
    const expected = ["dir_a/world_a.txt", "dir_a/hello_a.txt"];
    assert.deepStrictEqual(actual, expected);
  });

  it("ディレクトリが階層構造になっているとき、全てのファイルパスを階層構造のないリストで返す", async () => {
    // Act
    const ws = new Workspace(testPath, env);
    const actual = await ws.listFiles();

    // Assert
    const expected = [
      "world.txt",
      "hello.txt",
      "dir_a/world_a.txt",
      "dir_a/hello_a.txt",
      "dir_b/hello_b.txt",
    ];
    assert.deepStrictEqual(actual, expected);
  });

  it("存在しないファイルが含まれているとき、例外を発生させる", async () => {
    // Arrange
    const env = {
      fs: {
        ...defaultFs,
        readdir: fakeReaddir,
        stat: jest.fn().mockImplementation(() => {
          throw ENOENT;
        }),
      },
    };

    // Act
    const ws = new Workspace("test/noent.txt", env);

    // Assert
    await expect(ws.listFiles()).rejects.toThrow(MissingFile);
  });
});

describe("Workspace#readFile", () => {
  const testContent = [
    `Lorem Ipsum is simply dummy text of the printing and typesetting industry. `,
    `Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, `,
    `when an unknown printer took a galley of type and scrambled it to make a type specimen book.`,
  ].join("\n");
  const mockedReadFile = jest.fn().mockResolvedValue(testContent);
  let actual: string | null = null;
  beforeAll(async () => {
    // Arrange

    // Act
    const ws = new Workspace("/test/jit", {
      fs: { ...defaultFs, readFile: mockedReadFile },
    });
    actual = await ws.readFile("src/index.js");
  });
  // Assert
  it("ファイルパス", () => {
    assert.equal(mockedReadFile.mock.calls[0][0], "/test/jit/src/index.js");
  });
  it("ファイルの全データを返す", () => {
    const expected = testContent;
    assert.equal(expected, actual);
  });
});
