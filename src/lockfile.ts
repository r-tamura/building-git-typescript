import { FileService, defaultFs } from "./services";
import { BaseError } from "./util";
import { constants, promises } from "fs";
import { IOHandle } from "./types";
import { LockDenied } from "./refs";
import * as path from "path";
export type LockfileEnvironment = {
  fs?: FileService;
};

const splitExt = (pathname: string): [string, string | undefined] => {
  const basename = path.basename(pathname);
  if (!basename.includes(".")) {
    return [pathname, undefined];
  }

  const split = pathname.split(".");
  const ext = split.pop();
  return [split.join("."), ext];
};

export class MissingParent extends BaseError {}
export class NoPermission extends BaseError {}
export class StaleLock extends BaseError {}

export class Lockfile implements IOHandle {
  #filePath: string;
  #lockPath: string;
  #lock: promises.FileHandle | null;
  #fs: FileService;
  constructor(path: string, env: LockfileEnvironment = {}) {
    this.#filePath = path;

    const [basepath, _ext] = splitExt(path);
    this.#lockPath = basepath + ".lock";

    this.#lock = null;

    this.#fs = env.fs ?? defaultFs;
  }

  /**
   * ロックされていない場合はロックを取得し、ロックされているときは例外LockDeniedを発生させる
   */
  async holdForUpdate() {
    const flags = constants.O_RDWR | constants.O_CREAT | constants.O_EXCL;
    try {
      if (this.#lock === null) {
        this.#lock = await this.#fs.open(this.#lockPath, flags);
      }
    } catch (e) {
      const nodeErr = e as NodeJS.ErrnoException;
      switch (nodeErr.code) {
        case "EEXIST":
          // すでにロックされている場合
          throw new LockDenied(`Unable to create ${this.#lockPath}: File exists.`);
        case "ENOENT":
          throw new MissingParent(nodeErr.message);
        case "EACCES":
          throw new NoPermission(nodeErr.message);
      }
    }
  }

  async rollback() {
    this.throwOnStaleLock(this.#lock);

    await this.#lock.close();
    await this.#fs.unlink(this.#lockPath);
    this.#lock = null;
  }

  async write(data: Buffer | string) {
    this.throwOnStaleLock(this.#lock);
    if (typeof data === "string") {
      const res = await this.#lock.write(data, null, "binary");
      // Note: コンパイラが { bytesWritten: number, buffer: string } として認識しない
      return res as any;
    }
    return this.#lock.write(data);
  }

  // TODO: TBI ?
  async read(...args: any[]) {
    return {} as any;
  }

  async commit() {
    this.throwOnStaleLock(this.#lock);
    await this.#lock.close();
    await this.#fs.rename(this.#lockPath, this.#filePath);
    this.#lock = null;
  }

  private throwOnStaleLock(lock: promises.FileHandle | null): asserts lock {
    if (lock === null) {
      throw new StaleLock();
    }
  }
}
