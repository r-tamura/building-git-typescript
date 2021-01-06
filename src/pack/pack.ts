import { Nullable, OID } from "../types";
import { BaseError } from "../util/error";

export const HEADER_SIZE = 12;
export const SIGNATURE = "PACK";
export const VERSION = 2;

/** Pack形式内のオブジェクトタイプ */
export const COMMIT = 1;
export const TREE = 2;
export const BLOB = 3;

export class InvalidPack extends BaseError {}

export type GitObjectType = typeof COMMIT | typeof TREE | typeof BLOB;

export const TYPE_CODES = {
  commit: COMMIT,
  tree: TREE,
  blob: BLOB,
} as const;

type GitObjectName = keyof typeof TYPE_CODES;

export class Record {
  /**
   * 不必要なoid
   * 元々のGitObjec#oidがstring | nullだったため、database.Seriarizable#oidもstring | null
   * TODO: database.Seriarizable#oidのundefined化
   */
  oid: Nullable<OID> = null;
  constructor(public type: GitObjectName, public data: Buffer) {}

  static of(type: GitObjectName, data: Buffer) {
    return new this(type, data);
  }

  toString(encoding: Parameters<Buffer["toString"]>[0] = "binary") {
    return this.data.toString(encoding);
  }
}
