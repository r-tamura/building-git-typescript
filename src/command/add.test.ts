import * as assert from "power-assert";
import * as Service from "../services";
import { main } from "../main";
import { Database } from "../database/database";
import { Refs, LockDenied } from "../refs";
import { GitObject, Environment } from "../types";
import { Index } from "../gindex";
import { defaultProcess } from "../services";
import { Workspace, MissingFile } from "../workspace";
import { makeTestStats } from "../__test__";

const mockedStore = jest.fn().mockImplementation(async (o: GitObject) => {
  o.oid = "123456789abcdeffedcba98765432112345678";
});
jest.mock("../database/database");
jest.mock("../gindex");
jest.mock("../refs");
jest.mock("../workspace");
const MockedDatabase = Database as jest.Mock;

const testStats = makeTestStats();
const mockedListFiles = jest.fn().mockResolvedValue(["a.txt", "b.html"]);
const mockedReadFile = jest.fn().mockResolvedValue("hi");
const mockedStatFile = jest.fn().mockResolvedValue(testStats);

const MockedWs = (Workspace as unknown) as jest.Mock<Partial<Workspace>>;
MockedWs.mockImplementation((pathname: string) => ({
  listFiles: mockedListFiles,
  readFile: mockedReadFile,
  statFile: mockedStatFile,
}));
const MockedRefs = Refs as jest.Mock;
const MockedIndex = (Index as unknown) as jest.Mock<Partial<Index>>;

jest
  .spyOn(Service, "readTextStream")
  .mockImplementation(() => Promise.resolve("test message"));

const testEnvGlobal: Environment = {
  fs: Service.defaultFs,
  process: defaultProcess,
  date: {
    now: () => new Date(2020, 3, 1),
  },
};

describe("add", () => {
  describe("normal path", () => {
    beforeAll(() => {
      jest.clearAllMocks();
    });
    beforeAll(async () => {
      // Arrange
      MockedDatabase.mockReset();
      MockedDatabase.mockImplementation((pathname: string) => ({
        store: mockedStore,
      }));

      // Act
      await main(["add", "."], testEnvGlobal);
    });
    it("add対象のファイルを読み込む", () => {
      assert.equal(mockedReadFile.mock.calls.length, 2);
      assert.equal(mockedStatFile.mock.calls.length, 2);
    });

    it("indexが更新される", () => {
      assert.equal(MockedIndex.mock.calls.length, 1, "Indexインスタンスの生成");
      const instance = MockedIndex.mock.instances[0];

      const mockedLoadforUpdate = instance.loadForUpdate as jest.Mock;
      assert.equal(
        mockedLoadforUpdate.mock.calls.length,
        1,
        "index更新前にindexファイルを読み込む"
      );

      const mockedAdd = instance.add as jest.Mock;
      const expectedFiles = [
        ["a.txt", "123456789abcdeffedcba98765432112345678", testStats],
        ["b.html", "123456789abcdeffedcba98765432112345678", testStats],
      ];

      expectedFiles.forEach((expected, i) => {
        assert.deepEqual(
          mockedAdd.mock.calls[i],
          expected,
          "最初のadd対象ファイルがindexへ追加"
        );
      });

      const mockedWriteUpdates = instance.writeUpdates as jest.Mock;
      assert.equal(
        mockedWriteUpdates.mock.calls.length,
        1,
        "indexファイルの更新"
      );
    });
  });

  describe("入力値が不正なとき、indexファイルを更新しないで終了する", () => {
    type AnyFunction = (...args: any[]) => any;
    const tests: [string, Error, number, (fn: AnyFunction) => void][] = [
      [
        "ファイルが存在しないとき",
        new MissingFile(`test MissingFile message`),
        128,
        (throwErr) => {
          MockedWs.mockImplementation(() => ({
            listFiles: throwErr,
            readFile: mockedReadFile,
            statFile: mockedStatFile,
          }));
        },
      ],
      [
        "indexファイルがロックされているとき",
        new LockDenied(`test LockDenied message`),
        128,
        (throwErr) => {
          MockedIndex.mockImplementation(() => ({
            loadForUpdate: throwErr,
            releaseLock: jest.fn(),
          }));
        },
      ],
    ];
    it.each(tests)(
      "%s, エラーメッセージを表示しプロセスを以上終了する",
      async (_given, Err, code, mocker) => {
        // Arrange
        jest.clearAllMocks();
        const throwErr = jest.fn().mockImplementation(() => {
          throw Err;
        });
        mocker(throwErr);

        // process.exit の返り値が never のため any型へキャスト
        const spyExit = jest
          .spyOn(process, "exit")
          .mockImplementation(jest.fn() as any);
        // Act
        await main(["add", "test"], testEnvGlobal);

        // Assert
        // prettier-ignore
        assert.equal(throwErr.mock.calls.length, 1)
        assert.equal(
          mockedReadFile.mock.calls.length,
          0,
          "indexファイルのオープン"
        );
        assert.equal(spyExit.mock.calls[0][0], code, "プロセス返り値");
      }
    );
  });
});
