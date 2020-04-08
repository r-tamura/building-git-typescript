import * as path from "path"
import { FileService, defaultFs } from "./services"
import { OID } from "./types"
import { constants } from "fs"

type Environment = {
  fs?: FileService
}

export class Refs {
  #pathname: string
  #fs: FileService
  constructor(pathname: string, env: Environment = {}) {
    this.#pathname = pathname
    this.#fs = env.fs ?? defaultFs
  }

  async updateHead(oid: OID) {
    this.#fs.writeFile(this.headPath, oid)
  }

  /**
   * HEADのデータを読み込みます。HEADファイルが存在しない場合はnullを返します。
   */
  async readHead() {
    try {
      return await this.#fs.readFile(this.headPath, { encoding: "ascii" })
    } catch (e) {
      const nodeErr = e as NodeJS.ErrnoException
      if (nodeErr.code === "ENOENT") {
        return null
      } else {
        throw e
      }
    }
  }

  private get headPath() {
    return path.join(this.#pathname, "HEAD")
  }
}