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
  constructor(public type: GitObjectName, public data: Buffer) {}

  static of(type: GitObjectName, data: Buffer) {
    return new this(type, data);
  }

  toString(encoding: Parameters<Buffer["toString"]>[0]) {
    return this.data.toString(encoding);
  }
}
