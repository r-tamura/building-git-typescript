import * as path from "path";
import { O_WRONLY, O_EXCL, O_CREAT } from "constants";
import { Pathname, OID } from "../types";
import { FileService, exists } from "../services";
import { BaseError } from "../util";

export interface Environment {
  fs: FileService;
}

/** マージがペンディングされていない状態でコンフリクト解決を実行した際のエラー  */
export class Error extends BaseError {}
export class PendingCommit {
  #headPath: Pathname;
  #messagePath: Pathname;
  #fs: FileService;
  constructor(pathname: Pathname, env: Environment) {
    this.#headPath = path.join(pathname, "MERGE_HEAD");
    this.#messagePath = path.join(pathname, "MERGE_MSG");
    this.#fs = env.fs;
  }

  async start(oid: OID, message: string) {
    const flags: number = O_WRONLY | O_CREAT | O_EXCL;
    return Promise.all([
      this.#fs.writeFile(this.#headPath, oid, { flag: flags }),
      this.#fs.writeFile(this.#messagePath, message, { flag: flags }),
    ]).catch(async (err) => {
      await this.clear();
      throw err;
    });
  }

  async mergeMessage() {
    return this.#fs.readFile(this.#messagePath, "utf8");
  }

  /**
   * コンフリクト発生時に指定されていたマージ元(right)のコミットOIDを取得します。
   */
  async mergeOid() {
    return this.#fs.readFile(this.#headPath, "ascii").catch((e: NodeJS.ErrnoException) => {
      switch (e.code) {
        case "ENOENT":
          const name = path.basename(this.#headPath);
          throw new Error(`There is no merge in progress (${name} missing).`);
        default:
          throw e;
      }
    });
  }

  async clear() {
    const promises = [this.#fs.unlink(this.#headPath), this.#fs.unlink(this.#messagePath)];
    return Promise.all(promises).catch((e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") {
        const name = path.basename(this.#headPath);
        throw new Error(`There is no merge to abort (${name} missing).`);
      }
      throw e;
    });
  }

  async inProgress() {
    return exists(this.#fs, this.#headPath);
  }
}
