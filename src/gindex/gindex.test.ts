import * as assert from "power-assert";
import { Index } from "./gindex";
import { Lockfile } from "../lockfile";
import { defaultFs } from "../services";
import { makeTestStats } from "../__test__";
import { Stats } from "fs";

jest.mock("../lockfile");
const MockedLockfile = (Lockfile as unknown) as jest.Mock<Partial<Lockfile>>;
const testOid = "ba78afac62556e840341715936909cc36fe83a77"; // sha1 of 'jit'

describe("Index#writeUpdate", () => {
  const testPath = ".git/index";
  const testObjectPath = "README.md";
  describe("Lockfileがロックされているとき、indexへの書き込みを行わない", () => {
    // Arrange
    const mockedWrite = jest.fn();
    let actual: boolean;
    beforeAll(async () => {
      // Act
      const index = new Index(testPath);
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
      const index = new Index(testPath);
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
