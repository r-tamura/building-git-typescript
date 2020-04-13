import * as assert from "power-assert";
import { Index } from "./gindex";
import { Lockfile } from "../lockfile";
import { Entry } from "./entry";
import { defaultFs } from "../services";
import { makeTestStats } from "../__test__";

jest.mock("../lockfile");
const MockedLockfile = Lockfile as jest.Mock<Lockfile>;
const testOid = "ba78afac62556e840341715936909cc36fe83a77"; // sha1 of 'jit'

// jest.mock("./entry", () => ({
//   Entry: jest.fn().mockReturnValue(({
//     create: (...args: any[]) => {}
//   } as typeof Entry))
// }))

describe("Index#writeUpdate", () => {
  const testPath = ".git/index";
  const testObjectPath = "README.md";
  describe("Lockfileがロックされているとき、indexへの書き込みを行わない", () => {
    // Arrange
    const mockedWrite = jest.fn();
    let actual: boolean;
    const env = {
      fs: { ...defaultFs, write: mockedWrite },
    };
    beforeAll(async () => {
      // Act
      const index = new Index(testPath, env);
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
    const spies: jest.SpyInstance[] = [];
    let actual: boolean;
    let spyWrite: jest.SpyInstance;
    let spyHoldForUpdate: jest.SpyInstance;
    // Arrange
    beforeAll(() => {
      MockedLockfile.prototype.write.mockClear();
      MockedLockfile.prototype.holdForUpdate.mockClear();
    });
    beforeAll(async () => {
      spyWrite = jest.spyOn(Lockfile.prototype, "write");
      spyHoldForUpdate = jest
        .spyOn(Lockfile.prototype, "holdForUpdate")
        .mockResolvedValue(true);
      spies.push(spyHoldForUpdate);
      spies.push(spyWrite);

      // Act
      const index = new Index(testObjectPath);
      index.add(testObjectPath, testOid, makeTestStats());
      actual = await index.writeUpdates();
    });
    afterAll(() => {
      spies.forEach((spy) => spy.mockReset());
    });

    // Assert
    it("Lockfileをロックする", () => {
      assert.equal(spyHoldForUpdate.mock.calls.length, 1);
    });

    it("ヘッダの書き込み", () => {
      assert.deepStrictEqual(
        Buffer.from(spyWrite.mock.calls[0][0], "binary"),
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
      const arg = spyWrite.mock.calls[1][0];
      const actualData = Buffer.from(arg, "binary");

      assert.equal(actualData.length, 72, "データ長");
      const actualOid = actualData.slice(40, 60).toString("hex");
      assert.equal(actualOid, testOid, "oid");
    });

    it("フッタの書き込み", () => {
      const actualSha1 = spyWrite.mock.calls[2][0];
      assert.deepEqual(
        Buffer.from(actualSha1, "binary"),
        Buffer.from("5731b15defefca2d8429d179e2650f99f4bccdbd", "hex")
      );
    });

    it("返り値", () => {
      assert.equal(actual, true);
    });
  });
});
