import * as CallbackFs from "fs";
import * as zlib from "zlib";
import { promisify } from "util";
import { Readable } from "stream";
const fs = CallbackFs.promises;

export type FileService = Pick<
  typeof fs,
  | "fstat"
  | "mkdir"
  | "open"
  | "read"
  | "readdir"
  | "readFile"
  | "rename"
  | "write"
  | "writeFile"
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
    stream.on("data", chunk => (data += chunk));
    stream.on("end", () => resolve(data));
    stream.on("error", err => reject(err));
  });
}
