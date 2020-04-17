import { promises } from "fs";
import { Process, FileService } from "./services";

/**
 * .git/objectsへ保存することができるデータ
 */
export type OID = string;
export interface GitObject {
  oid: OID | null;
  type: () => string;
  toString: () => string;
}

/**
 * ファイルパス
 */
export type Pathname = string;

/**
 * IO
 */

export type IOHandle = Pick<promises.FileHandle, "write" | "read">;

export type Environment = {
  process: Process;
  fs: FileService;
  date: {
    now(): Date;
  };
};
