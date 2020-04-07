import * as CallbackFs from "fs";
import * as zlib from "zlib";
import { promisify } from "util";
const fs = CallbackFs.promises;

export type FileService = Pick<
  typeof fs,
  | "mkdir"
  | "readdir"
  | "readFile"
  | "open"
  | "write"
  | "writeFile"
  | "rename"
  | "fstat"
>;
export const defaultFs: FileService = fs;
const deflate = promisify(zlib.deflate) as (
  buf: Parameters<typeof zlib.deflate>[0],
  options: Parameters<typeof zlib.deflate>[1]
) => Promise<Buffer>;
export type Zlib = {
  deflate: typeof deflate;
};
export const defaultZlib = {
  deflate: promisify(zlib.deflate) as typeof deflate
};
