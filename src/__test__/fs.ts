import { Stats, Dirent } from "fs";
import { FS_ERROR } from "./error";

export const makeTestStats = (props: Partial<Stats> = {}): Stats => {
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
  const stats = new Stats();
  return { ...stats, ...defaultProps, ...props, isFile, isDirectory };
};

type Dict<T = string> = { [s: string]: T };

/**
 * ディレクトリとファイルを指定することでfsモジュールのmockを作成します
 * @param dirs
 * @param files
 */
export function mockFs(dirs: Dict, files: Dict) {
  return {
    readdir: jest.fn().mockImplementation(async (p: string) => dirs[p]),
    readFile: jest.fn().mockImplementation(async (p: string) => files[p]),
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
