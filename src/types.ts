import { promises } from "fs";
import { Process, FileService, Logger } from "./services";

/**
 * .git/objectsへ保存することができるデータ
 */
export type OID = string;

export interface GitObjectParser {
  parse(buf: Buffer): GitObject;
}
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
  logger: Logger;
  fs: FileService;
  date: {
    now(): Date;
  };
};

export type EnvVar = string | undefined;
export type EnvVars = { [s: string]: EnvVar };
