import { promises } from "node:fs";
import * as Database from "./database/index.ts";
import { FileService, Logger, Process } from "./services/index.ts";

/**
 * Type utility
 */
export type NonNullProps<T> = {
  [k in keyof T]: NonNullable<T[k]>;
};

/**
 * .git/objectsへ保存することができるデータ
 */
export type OID = string;

export interface GitObjectParser {
  parse(buf: Buffer): GitObject;
}
export type GitObject = Database.Commit | Database.Tree | Database.Blob;

export type CompleteCommit = NonNullProps<Database.Commit>;
export type CompleteTree = NonNullProps<Database.Tree>;
export type CompleteGitObject = NonNullProps<GitObject>;

// ファイルパス
export type Pathname = string;

/**
 * リビジョン文字列 '@', 'HEAD', 'master^2' など
 */
export type RevisionName = string;

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

// Util
export type Dict<T> = { [s: string]: T };
export type Nullable<T> = T | null;

export interface Rand {
  sample: (str: string) => string;
}
