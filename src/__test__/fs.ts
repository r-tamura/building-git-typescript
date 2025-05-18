import { Stats } from "node:fs";
import { FileHandle } from "node:fs/promises";
import { FileService } from "../services/FileService.ts";
import { FS_ERROR } from "./error";

function makeNotExpectedCalledFileService() {
  const errorMock = (apiName: string) =>
    jest.fn(() => {
      throw new Error(
        `UnexpectedCall: モックされていないFileService API '${apiName}'が実行されました. モックを実装するようにしてください。`,
      );
    });

  return {
    writeFile: errorMock("writeFile"),
    readFile: errorMock("readFile"),
    unlink: errorMock("unlink"),
    open: errorMock("open"),
    access: errorMock("access"),
    readdir: errorMock("readdir"),
    stat: errorMock("stat"),
    mkdir: errorMock("mkdir"),
    rmdir: errorMock("rmdir"),
    rename: errorMock("rename"),
    rm: errorMock("rm"),
    chmod: errorMock("chmod"),
  };
}

export function makeDummyFileService(
  override: Partial<FileService> = {},
): FileService {
  return {
    ...makeNotExpectedCalledFileService(),
    ...override,
  };
}

/**
 * Statsコンストラクタが非推奨になったので代替えで実装したが、new Statsを再現できていない
 * @returns
 * @deprecated
 */
export function mockFsStats(): Stats {
  const stats = Object.create(Stats.prototype);
  return stats;
}

export function mockOpen(data: Buffer): jest.Mock<FileHandle> {
  const fileHandle = {
    write: jest
      .fn()
      .mockResolvedValue({ bytesWritten: data.length, buffer: data }),
    read: jest.fn().mockResolvedValue({ bytesRead: data.length, buffer: data }),
    close: jest.fn(),
  } as unknown as FileHandle;
  return jest.fn().mockResolvedValue(fileHandle);
}

export function makeDummyFileStats(props: Partial<Stats> = {}): Stats {
  const isFile = jest.fn().mockReturnValue(props.isFile ?? false);
  const isDirectory = jest.fn().mockReturnValue(props.isDirectory ?? false);

  const defaultProps = {
    dev: 16777221,
    mode: 33188,
    nlink: 1,
    uid: 501,
    gid: 20,
    rdev: 0,
    blksize: 4096,
    ino: 8641819819,
    size: 240,
    blocks: 8,
    atimeMs: 1586430703479.845,
    mtimeMs: 1586430700957.3962,
    ctimeMs: 1586430701957.3962,
    birthtimeMs: 1586310405936.23,
    atime: new Date("2020-04-09T11:11:43.480Z"),
    mtime: new Date("2020-04-09T11:11:41.957Z"),
    ctime: new Date("2020-04-09T11:11:41.957Z"),
    birthtime: new Date("2020-04-08T01:46:45.936Z"),
  };
  // @ts-expect-error Statsコンストラクタは非推奨だが、代替えができていない mockFsStatsではテストに失敗する
  const stats = new Stats();
  return { ...stats, ...defaultProps, ...props, ...{ isFile, isDirectory } };
}

/**
 * ディレクトリとファイルを指定することでfsモジュールのmockを作成します
 * @param dirs
 * @param files
 */
export function mockFs(
  dirs: Record<string, string[]>,
  files: Record<string, string>,
) {
  return {
    readdir: jest.fn().mockImplementation(async (p: string) => {
      if (!(p in dirs)) {
        console.warn("mocked readdir: ENOENT", p, dirs);
        throw mockFsError("ENOENT")();
      }
      return dirs[p];
    }),
    readFile: jest.fn().mockImplementation(async (p: string) => {
      if (!(p in files)) {
        throw mockFsError("ENOENT")();
      }
      return files[p];
    }),
    stat: jest.fn().mockImplementation(async (p: string) => {
      return files[p]
        ? { isFile: () => true, isDirectory: () => false }
        : dirs[p]
        ? { isFile: () => false, isDirectory: () => true }
        : null;
    }),
    access: jest.fn().mockImplementation(async (p: string) => {
      if (dirs[p] || files[p]) {
        return;
      }
      throw mockFsError("ENOENT")();
    }),
  };
}

type MockError = "EEXIST" | "ENOENT" | "EACCES";

/**
 * fsモジュールの例外を発生ささせます
 * asyncがtrueのときはPromise.rejectを返します
 *
 * @param err エラーコード
 * @param async
 */
export const mockFsError = (err: MockError, async: "sync" | "async" = "sync") =>
  jest.fn().mockImplementation(() => {
    if (async === "async") {
      return Promise.reject(FS_ERROR[err]);
    } else {
      throw FS_ERROR[err];
    }
  });
