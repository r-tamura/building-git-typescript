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

const deflate = promisify(zlib.deflate);
export type Zlib = {
  deflate: typeof deflate;
};
export const defaultZlib = {
  deflate: promisify(zlib.deflate)
};
