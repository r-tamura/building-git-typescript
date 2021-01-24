import * as assert from "power-assert";
import { Checksum } from "./checksum";

describe("Checksum#writeChecksum", () => {
  const expectedSha1 = Buffer.from(
    "44115646e09ab3481adc2b1dc17be10dd9cdaa09",
    "hex",
  ); // 'testdata'のSHA1値
  const mockedWrite = jest.fn();
  const mockedRead = jest.fn().mockResolvedValue({
    bytesRead: expectedSha1.length,
    buffer: expectedSha1,
  });
  const mockedFileHandle = {
    write: mockedWrite,
    read: mockedRead,
  };
  describe("チェックサム書き込んだとき、ハッシュ値を失わない", () => {
    beforeAll(async () => {
      // Arrange
      jest.clearAllMocks();

      // Act
      const checksum = new Checksum(mockedFileHandle);
      await checksum.write(Buffer.from("testdata"));
      await checksum.writeChecksum();
      await checksum.verifyChecksum();
    });

    it("ハッシュの書き込み", () => {
      // checksum.write で writeが呼び出されるため2回目の呼び出しをテストする
      assert.deepEqual(mockedWrite.mock.calls[1][0], expectedSha1);
    });
  });
});
