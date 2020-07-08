import * as path from "path";
import { Pathname, OID } from "../types";
import { FileService } from "../services";
import { O_WRONLY, O_EXCL, O_CREAT } from "constants";

export interface Environment {
  fs: FileService;
}

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

  async clear() {
    return Promise.all([this.#fs.unlink(this.#headPath), this.#fs.unlink(this.#messagePath)]);
  }
}
