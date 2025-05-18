import { constants, promises } from "fs";
import * as path from "path";
import { LockDenied } from "./refs";
import { defaultFs, FileService } from "./services";
import { IOHandle } from "./types";
import { BaseError, posixPath, PosixPath, toOsPath } from "./util";
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

export class MissingParent extends BaseError {
  static {
    this.prototype.name = "MissingParent";
  }
}
export class NoPermission extends BaseError {
  static {
    this.prototype.name = "NoPermission";
  }
}
export class StaleLock extends BaseError {
  static {
    this.prototype.name = "StaleLock";
  }
}

export class Lockfile implements IOHandle {
  #filePath: PosixPath;
  #lockPath: PosixPath;
  #lock: promises.FileHandle | null;
  #fs: FileService;
  constructor(path: PosixPath, env: LockfileEnvironment = {}) {
    this.#filePath = path;

    const [basepath, _ext] = splitExt(path);
    this.#lockPath = posixPath(basepath + ".lock");

    this.#lock = null;

    this.#fs = env.fs ?? defaultFs;
  }

  private async lock(flags: number): Promise<void> {
    this.#lock = await this.#fs.open(toOsPath(this.#lockPath), flags);
  }

  private async unlock() {
    this.#lock = null;
  }

  /**
   * ロックされていない場合はロックを取得し、ロックされているときは例外LockDeniedを発生させる
   */
  async holdForUpdate(): Promise<void> {
    const flags = constants.O_RDWR | constants.O_CREAT | constants.O_EXCL;
    try {
      if (this.#lock === null) {
        await this.lock(flags);
      }
    } catch (e) {
      const nodeErr = e as NodeJS.ErrnoException;
      switch (nodeErr.code) {
        case "EEXIST":
          // すでにロックされている場合
          throw new LockDenied(
            `Unable to create ${this.#lockPath}: File exists.`,
            { cause: nodeErr },
          );
        case "ENOENT":
          throw new MissingParent(
            `parent directory for lockfile '${this.#lockPath}' not found`,
            {
              cause: nodeErr,
            },
          );
        case "EACCES":
          throw new NoPermission("lockfile is not writable", {
            cause: nodeErr,
          });
      }
    }
  }

  async rollback(): Promise<void> {
    this.throwOnStaleLock(this.#lock);

    await this.#lock.close();
    await this.#fs.unlink(toOsPath(this.#lockPath));
    this.unlock();
  }

  write(data: Buffer): Promise<{ bytesWritten: number; buffer: Buffer }>;
  write(data: string): Promise<{ bytesWritten: number; buffer: string }>;
  async write(data: Buffer | string) {
    this.throwOnStaleLock(this.#lock);
    if (typeof data === "string") {
      const res = await this.#lock.write(data, null, "binary");
      return res;
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
    await this.#fs.rename(toOsPath(this.#lockPath), toOsPath(this.#filePath));
    this.unlock();
  }

  private throwOnStaleLock(lock: promises.FileHandle | null): asserts lock {
    if (lock === null) {
      throw new StaleLock(`Lock file ${this.#lockPath} is stale`);
    }
  }
}
