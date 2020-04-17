import * as path from "path";
import { FileService, defaultFs } from "./services";
import { OID } from "./types";
import { BaseError } from "./util";
import { Lockfile } from "./lockfile";

type Environment = {
  fs?: FileService;
};

export class LockDenied extends BaseError {}
export class Refs {
  #pathname: string;
  #fs: FileService;
  constructor(pathname: string, env: Environment = {}) {
    this.#pathname = pathname;
    this.#fs = env.fs ?? defaultFs;
  }

  /**
   * HEADを更新します
   * HEADが他のプロセスと競合した場合 LockDenied エラーの例外を投げます
   * @param oid オブジェクトID
   */
  async updateHead(oid: OID) {
    const lockfile = new Lockfile(this.headPath, { fs: this.#fs });

    await lockfile.holdForUpdate();

    await lockfile.write(oid);
    await lockfile.write("\n");
    await lockfile.commit();
  }

  /**
   * HEADのデータを読み込みます。HEADファイルが存在しない場合はnullを返します。
   */
  async readHead() {
    try {
      return await this.#fs.readFile(this.headPath, { encoding: "ascii" });
    } catch (e) {
      const nodeErr = e as NodeJS.ErrnoException;
      if (nodeErr.code === "ENOENT") {
        return null;
      } else {
        throw e;
      }
    }
  }

  private get headPath() {
    return path.join(this.#pathname, "HEAD");
  }
}
