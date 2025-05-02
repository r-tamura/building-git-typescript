import { O_CREAT, O_EXCL, O_WRONLY } from "constants";
import * as path from "path";
import { FileService, exists } from "../services";
import { OID, Pathname } from "../types";
import { BaseError } from "../util";

export interface Environment {
  fs: FileService;
}

const HeadFiles = {
  merge: "MERGE_HEAD",
  cherry_pick: "CHERRY_PICK_HEAD",
  revert: "REVERT_HEAD",
} as const;

export type MergeType = keyof typeof HeadFiles;

/** マージがペンディングされていない状態でコンフリクト解決を実行した際のエラー  */
export class Error extends BaseError {}
export class PendingCommit {
  #pathname: Pathname;
  messagePath: Pathname;
  #fs: FileService;  constructor(pathname: Pathname, env: Environment) {
    this.#pathname = pathname;
    this.messagePath = path.posix.join(pathname, "MERGE_MSG");
    this.#fs = env.fs;
  }
  async start(oid: OID, type: MergeType = "merge") {
    const pathname = path.posix.join(this.#pathname, HeadFiles[type]);
    const flags: number = O_WRONLY | O_CREAT | O_EXCL;
    await this.#fs.writeFile(pathname, oid, { flag: flags });
  }

  async mergeMessage() {
    return this.#fs.readFile(this.messagePath, "utf8");
  }

  /**
   * コンフリクト発生時に指定されていたマージ元(right)のコミットOIDを取得します。
   */  async mergeOid(type: MergeType = "merge") {
    const headPath = path.posix.join(this.#pathname, HeadFiles[type]);
    return this.#fs
      .readFile(headPath, "ascii")
      .catch((e: NodeJS.ErrnoException) => {
        switch (e.code) {
          case "ENOENT": {
            const name = path.basename(headPath);
            throw new Error(`There is no merge in progress (${name} missing).`);
          }
          default:
            throw e;
        }
      });
  }
  async mergeType() {
    for (const [type, name] of Object.entries(HeadFiles)) {
      const pathname = path.posix.join(this.#pathname, name);
      if (await exists(this.#fs, pathname)) {
        return type as MergeType;
      }
    }
    return null;
  }
  async clear(type: MergeType = "merge") {
    const headPath = path.posix.join(this.#pathname, HeadFiles[type]);
    const promises = [
      this.#fs.unlink(headPath),
      this.#fs.unlink(this.messagePath),
    ];
    return Promise.all(promises).catch((e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") {
        const name = path.basename(headPath);
        throw new Error(`There is no merge to abort (${name} missing).`);
      }
      throw e;
    });
  }

  async inProgress() {
    return (await this.mergeType()) !== null;
  }
}
