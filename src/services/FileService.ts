import * as CallbackFs from "fs";
import * as zlib from "zlib";
import { promisify } from "util";
import { Readable } from "stream";
import { Pathname } from "../types";
const fs = CallbackFs.promises;

export type FileService = Pick<
  typeof fs,
  | "access"
  | "chmod"
  | "mkdir"
  | "open"
  | "read"
  | "readdir"
  | "readFile"
  | "rename"
  | "stat"
  | "unlink"
  | "write"
  | "writeFile"
  | "rmdir"
>;

export const defaultFs: FileService = fs;

export async function exists(fs: FileService, pathname: Pathname) {
  try {
    await fs.access(pathname);
    return true;
  } catch (e) {
    return false;
  }
}

export async function rmrf(fs: FileService, pathname: Pathname) {
  // rimraf.jsのようにファイルであると仮定してunlink -> EISDIRエラーならrmdirする
  // https://github.com/isaacs/rimraf/blob/master/rimraf.js
  try {
    await fs.unlink(pathname);
  } catch (e) {
    const nodeErr = e as NodeJS.ErrnoException;
    switch (nodeErr.code) {
      case "EISDIR":
        await fs.rmdir(pathname, { recursive: true });
      default:
        throw e;
    }
  }
}

/** zlib */
const deflate = promisify(zlib.deflate) as (
  buf: Parameters<typeof zlib.deflate>[0],
  options: Parameters<typeof zlib.deflate>[1]
) => Promise<Buffer>;
const inflate = promisify<zlib.InputType, Buffer>(zlib.deflate);
export type Zlib = {
  deflate: typeof deflate;
  inflate: typeof inflate;
};
export const defaultZlib = {
  deflate: promisify(zlib.deflate) as typeof deflate,
  inflate: promisify(zlib.inflate) as typeof inflate,
};

/**
 * ReadableStreamからPromiseを生成します
 * Ref: https://humanwhocodes.com/snippets/2019/05/nodejs-read-stream-promise/
 *
 * @param stream 'end'イベントまでstreamを読む
 * @param encoding
 */
export function readTextStream(stream: Readable, encoding = "utf8") {
  stream.setEncoding(encoding);
  return new Promise<string>((resolve, reject) => {
    let data = "";
    stream.on("data", (chunk) => (data += chunk));
    stream.on("end", () => resolve(data));
    stream.on("error", (err) => reject(err));
  });
}
