import { FileService, defaultFs } from "./services";
import { BaseError } from "./util"
import { constants, promises } from "fs";
type Environment = {
  fs?: FileService
}

const splitExt = (path: string) => {
  const split = path.split(".")
  const ext = split.pop()
  return [split.join("."), ext]
}

export class MissingParent extends BaseError {}
export class NoPermission extends BaseError {}
export class StaleLock extends BaseError {}

type Lock = promises.FileHandle | null
export class Lockfile {
  #filePath: string
  #lockPath: string
  #lock: Lock
  #fs: FileService
  constructor(path: string, env: Environment = {}) {
    this.#filePath = path

    const [basepath, _ext] = splitExt(path)
    this.#lockPath = basepath + ".lock"

    this.#lock = null

    this.#fs = env.fs ?? defaultFs
  }

  /**
   * ロックされていない場合はロックを取得ししてからtrueを返し、ロックされている場合はfalseを返す
   */
  async holdForUpdate() {
    const flags = constants.O_RDWR | constants.O_CREAT | constants.O_EXCL
    try {
      if (this.#lock === null) {
        this.#lock = await this.#fs.open(this.#lockPath, flags)
      }
    } catch (e) {
      const nodeErr = e as NodeJS.ErrnoException
      switch (nodeErr.code) {
        case "EEXIST":
          // すでにロックされている場合
          return false
        case "ENOENT":
          throw new MissingParent()
        case "EACCES":
          throw new NoPermission()
      }
    }
    return true;
  }

  async write(data: string) {
    this.throwOnStaleLock(this.#lock)
    await this.#lock.write(data)
  }

  async commit() {
    this.throwOnStaleLock(this.#lock)
    this.#lock.close()
    await this.#fs.rename(this.#lockPath, this.#filePath)
    this.#lock = null
  }

  private throwOnStaleLock(lock: Lock): asserts lock {
    if (lock === null) {
      throw new StaleLock()
    }
  }
}