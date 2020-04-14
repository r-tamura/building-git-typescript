import * as assert from "power-assert";
import { Index } from "./gindex";
import { Lockfile } from "../lockfile";
import { defaultFs } from "../services";
import { makeTestStats } from "../__test__";
import { Stats, promises, PathLike } from "fs";

jest.mock("../lockfile");
const testIndexPath = ".git/index";
const MockedLockfile = (Lockfile as unknown) as jest.Mock<Partial<Lockfile>>;
const testOid = "ba78afac62556e840341715936909cc36fe83a77"; // sha1 of 'jit'

describe("Index#writeUpdate", () => {
  const testObjectPath = "README.md";
  describe("Lockfileがロックされているとき、indexへの書き込みを行わない", () => {
    // Arrange
    const mockedWrite = jest.fn();
    let actual: boolean;
    beforeAll(async () => {
      // Act
      const index = new Index(testIndexPath);
      actual = await index.writeUpdates();
    });
    afterAll(() => {
      MockedLockfile.mockClear();
    });

    // Arrange
    it("Lockfile生成", () => {
      assert.equal(MockedLockfile.mock.calls.length, 1);
    });

    it("Lockfileへの書き込み回数", () => {
      const mockedWrite = MockedLockfile.mock.instances[0].write as jest.Mock;
      assert.equal(mockedWrite.mock.calls.length, 0);
    });

    it("返り値", () => {
      assert.equal(actual, false);
    });
  });

  describe("Lockfileがロックされていないとき、indexへ全てのエントリを書き込む", () => {
    let actual: boolean;
    const mockedWrite = jest.fn();
    const mockedHoldForUpdate = jest.fn().mockResolvedValue(true);
    // Arrange
    beforeAll(() => {});
    beforeAll(async () => {
      MockedLockfile.mockReset();
      MockedLockfile.mockImplementation(() => ({
        write: mockedWrite,
        holdForUpdate: mockedHoldForUpdate,
        commit: jest.fn(),
      }));
      // Act
      const index = new Index(testObjectPath);
      index.add(testObjectPath, testOid, makeTestStats());
      actual = await index.writeUpdates();
    });

    // Assert
    it("Lockfileをロックする", () => {
      assert.equal(mockedHoldForUpdate.mock.calls.length, 1);
    });

    it("ヘッダの書き込み", () => {
      assert.deepStrictEqual(
        Buffer.from(mockedWrite.mock.calls[0][0], "binary"),
        Buffer.from([
          0x44,
          0x49,
          0x52,
          0x43, // DIRC
          0x00,
          0x00,
          0x00,
          0x02, // version
          0x00,
          0x00,
          0x00,
          0x01, // number of entries
        ])
      );
    });

    it("オブジェクトの書き込み(Oidのみ)", () => {
      const arg = mockedWrite.mock.calls[1][0];
      const actualData = Buffer.from(arg, "binary");

      assert.equal(actualData.length, 72, "データ長");
      const actualOid = actualData.slice(40, 60).toString("hex");
      assert.equal(actualOid, testOid, "oid");
    });

    it("フッタの書き込み", () => {
      const actualSha1 = mockedWrite.mock.calls[2][0];
      assert.deepEqual(
        Buffer.from(actualSha1, "binary"),
        Buffer.from("5731b15defefca2d8429d179e2650f99f4bccdbd", "hex")
      );
    });

    it("返り値", () => {
      assert.equal(actual, true);
    });
  });

  describe("複数ファイルのとき、ファイルパスでソートされた順番で書き込む", () => {
    // Arrange
    const mockedWrite = jest.fn();
    beforeAll(async () => {
      MockedLockfile.mockReset();
      MockedLockfile.mockImplementation(() => ({
        write: mockedWrite,
        holdForUpdate: jest.fn().mockResolvedValue(true),
        commit: jest.fn(),
      }));

      // Act
      const index = new Index(testIndexPath);
      const entries = [
        [
          "bin/jit",
          "1eeef788efe4e91fe5780a77679444772f5b9253",
          makeTestStats({ ino: 8641899915, mode: 33261 }),
        ],
        [
          ".gitignore",
          "81876f206950dc4d9c0f7d20aa43fe68ee8f9113",
          makeTestStats({
            ctimeMs: 1586222433163.7546,
            mtimeMs: 1586222433163.7546,
            ino: 8641636618,
          }),
        ],

        [
          "README.md",
          "78e6cf75f4a8afa5a46741523101393381913dd4",
          makeTestStats(),
        ],
      ] as [string, string, Stats][];
      entries.forEach((e) => index.add(...e));
      await index.writeUpdates();
    });

    // headerの書き込みがあるためインデックス0はスキップ
    it.each([
      [".gitignore", 1, "81876f206950dc4d9c0f7d20aa43fe68ee8f9113"],
      ["README.md", 2, "78e6cf75f4a8afa5a46741523101393381913dd4"],
      ["bin/jit", 3, "1eeef788efe4e91fe5780a77679444772f5b9253"],
    ])("%s", (expectedName, index, expectedHash) => {
      const arg = mockedWrite.mock.calls[index][0];
      const buf = Buffer.from(arg);
      assert.equal(buf.slice(40, 60).toString("hex"), expectedHash);
    });
  });
});

// 2 ファイル
// prettier-ignore
const fakeIndex = Buffer.of(
  0x44, 0x49, 0x52, 0x43, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x5e, 0x91, 0x5a, 0x0f,
  0x00, 0x00, 0x00, 0x00, 0x5e, 0x91, 0x5a, 0x0f, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x05,
  0x03, 0x1a, 0x3a, 0xcf, 0x00, 0x00, 0x81, 0xa4, 0x00, 0x00, 0x01, 0xf5, 0x00, 0x00, 0x00, 0x14,
  0x00, 0x00, 0x00, 0x00, 0xe6, 0x9d, 0xe2, 0x9b, 0xb2, 0xd1, 0xd6, 0x43, 0x4b, 0x8b, 0x29, 0xae,
  0x77, 0x5a, 0xd8, 0xc2, 0xe4, 0x8c, 0x53, 0x91, 0x00, 0x05, 0x62, 0x2e, 0x74, 0x78, 0x74, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x5e, 0x91, 0x5e, 0xa7, 0x00, 0x00, 0x00, 0x00, 0x5e, 0x91, 0x5e, 0xa7,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x05, 0x03, 0x1a, 0x3d, 0x55, 0x00, 0x00, 0x81, 0xa4,
  0x00, 0x00, 0x01, 0xf5, 0x00, 0x00, 0x00, 0x14, 0x00, 0x00, 0x00, 0x06, 0xcc, 0x62, 0x8c, 0xcd,
  0x10, 0x74, 0x2b, 0xae, 0xa8, 0x24, 0x1c, 0x59, 0x24, 0xdf, 0x99, 0x2b, 0x5c, 0x01, 0x9f, 0x71,
  0x00, 0x09, 0x77, 0x6f, 0x72, 0x6c, 0x64, 0x2e, 0x74, 0x78, 0x74, 0x00, 0x3b, 0xb0, 0x6f, 0x3f,
  0xcf, 0xcf, 0x26, 0x56, 0x71, 0xef, 0xb0, 0x29, 0xfb, 0x05, 0x87, 0x35, 0xd9, 0x0f, 0x7a, 0xdc,
)

function createFakeRead(data: Buffer = fakeIndex) {
  function* fakeRead(data: Buffer) {
    const length = data.length;
    let point = 0;
    let size = yield Promise.resolve({ bytesRead: 0, buffer: Buffer.alloc(0) });
    while (point + size < length) {
      const slice = data.slice(point, point + size);
      point += size;
      size = yield Promise.resolve({ bytesRead: size, buffer: slice });
      size = size ?? 0;
    }
    const slice = data.slice(point);
    yield Promise.resolve({ bytesRead: length - point, buffer: slice });
    return Promise.resolve(null);
  }
  const gen = fakeRead(data);
  gen.next();
  return async (
    buffer: Buffer | Uint8Array,
    offset?: any,
    length?: any,
    point?: any
  ) => {
    assert.equal(point, null);
    const empty = { bytesRead: 0, buffer };
    if (length < 0) {
      console.warn("length < 0");
      return empty;
    }
    const next = gen.next(length);
    if (next.done) {
      console.warn("done");
      return empty;
    }
    const { bytesRead, buffer: buf } = await next.value;
    buf.copy(buffer, 0, 0, buf.length);
    return { bytesRead, buffer };
  };
}

describe("loadForUpdate", () => {
  // Arrange
  const mockedRead = jest
    .fn<
      ReturnType<promises.FileHandle["read"]>,
      Parameters<promises.FileHandle["read"]>
    >()
    .mockImplementation(createFakeRead());
  const mockedOpen = jest
    .fn<Promise<Partial<promises.FileHandle>>, any>()
    .mockResolvedValue({
      read: mockedRead as any,
      close: jest.fn(),
    });
  const env = {
    fs: { ...defaultFs, open: mockedOpen as any },
  };
  describe("lockfileがロックされているとき、falseを返す", () => {
    let actual: boolean;
    beforeAll(async () => {
      MockedLockfile.mockReset();
      MockedLockfile.mockImplementation(() => ({
        write: jest.fn(),
        holdForUpdate: jest.fn().mockResolvedValue(false),
        commit: jest.fn(),
      }));

      // Act
      const index = new Index(testIndexPath, env);
      actual = await index.loadForUpdate();
    });

    it("indexファイルの読み込み", () => {
      assert.equal(mockedOpen.mock.calls.length, 0);
    });

    it("返り値", () => {
      assert.equal(actual, false);
    });
  });

  describe("lockfileがロックされていないとき、trueを返す", () => {
    let actual: boolean;
    beforeAll(async () => {
      // Arrange
      jest.clearAllMocks();
      MockedLockfile.mockReset();
      MockedLockfile.mockImplementation(() => ({
        write: jest.fn(),
        holdForUpdate: jest.fn().mockResolvedValue(true),
        commit: jest.fn(),
      }));

      // Act
      const index = new Index(testIndexPath, env);
      actual = await index.loadForUpdate();
    });

    it("indexファイルの読み込み", () => {
      assert.equal(mockedOpen.mock.calls.length, 1, "indexファイルオープン");

      assert.equal(
        mockedRead.mock.calls.length,
        6,
        "header + (file meta + file name)x2 + checksum"
      );
    });

    it("返り値", () => {
      assert.equal(actual, true);
    });
  });
});
