import * as CallbackFs from "fs";
import * as path from "path";
import * as readline from "readline";
import { Readable } from "stream";
import { promisify } from "util";
import * as zlib from "zlib";
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

export async function directory(fs: FileService, pathname: Pathname) {
  const stat = await fs.stat(pathname);
  return stat.isDirectory();
}

export async function rmrf(fs: FileService, pathname: Pathname) {
  // rimraf.jsのようにファイルであると仮定してunlink -> EPERM/EISDIRエラーならrmdirする
  // https://github.com/isaacs/rimraf/blob/master/rimraf.js
  try {
    await fs.unlink(pathname);
  } catch (e) {
    const nodeErr = e as NodeJS.ErrnoException;
    switch (nodeErr.code) {
      case "EISDIR":
      case "EPERM":
        await fs.rmdir(pathname, { recursive: true });
        return;
      case "ENOENT":
        return;
      default:
        throw e;
    }
  }
}

export async function mkdirp(fs: FileService, pathname: Pathname) {
  return fs.mkdir(pathname, { recursive: true });
}

export async function readdirRecursive(
  fs: FileService,
  pathname: Pathname
): Promise<string[]> {
  const parent = pathname;
  const envtries = await fs.readdir(parent);

  const files: string[] = [];
  for (const entry of envtries) {
    const entryPath = path.join(parent, entry);
    const stat = await fs.stat(entry);
    if (stat.isDirectory()) {
      const childs = await readdirRecursive(fs, entryPath);
      files.push(...childs);
    } else {
      files.push(entryPath);
    }
  }

  return files;
}

/** zlib */
type Deflate = typeof zlib.deflate;
const deflate = promisify(zlib.deflate) as (
  buf: Parameters<Deflate>[0],
  options: Parameters<Deflate>[1]
) => Promise<Buffer>;
const inflate = promisify<zlib.InputType, Buffer>(zlib.inflate);
export type Zlib = {
  deflate: typeof deflate;
  inflate: typeof inflate;
};
export const defaultZlib = { deflate, inflate };

/**
 * ReadableStreamからPromiseを生成します
 * Ref: https://humanwhocodes.com/snippets/2019/05/nodejs-read-stream-promise/
 *
 * @param stream 'end'イベントまでstreamを読む
 * @param encoding
 */
export function readTextStream(
  stream: Readable,
  encoding: BufferEncoding = "utf8"
) {
  stream.setEncoding(encoding);
  return new Promise<string>((resolve, reject) => {
    let data = "";
    stream.on("data", (chunk) => (data += chunk));
    stream.on("end", () => resolve(data));
    stream.on("error", (err) => reject(err));
  });
}

// Note: readlineモジュールがエラー時にキャッチできない問題。NodeJS側の問題っぽい?
// Fileストリームが正しくオープンできたことを保証してからストリームを返す
// https://stackoverflow.com/questions/59216364/how-to-handle-error-from-fs-readline-interface-async-iterator
// https://github.com/nodejs/node/issues/30831
async function createReadStreamSafe(
  filename: Pathname,
  encoding: BufferEncoding = "utf8"
): Promise<CallbackFs.ReadStream> {
  return new Promise((resolve, reject) => {
    const fileStream = CallbackFs.createReadStream(filename, { encoding })
      .on("error", reject)
      .on("open", () => {
        resolve(fileStream);
      });
  });
}

/**
 * テキストファイルを１行ごとに取得するAsyncIterableなブジェクトを返します
 */
export async function readByLine(
  pathname: Pathname,
  encoding: BufferEncoding = "utf8"
): Promise<readline.Interface> {
  const fileStream = await createReadStreamSafe(pathname, encoding);
  return readline.createInterface({
    input: fileStream,
  });
}

/**
 * ReadStreamから指定されたバイト数分のデータを読み込みます
 * @param stream
 * @param size 読み込みバイト数
 * @param timeout タイムアウト(ms)
 */
export async function readChunk(
  stream: NodeJS.ReadableStream,
  size: number,
  timeout = 2000
) {
  const readable = async (stream: NodeJS.ReadableStream) => {
    // TypeScriptのNodeJS型定義にreadableEndedが定義されていない
    // https://nodejs.org/api/stream.html#stream_readable_readableended
    if ((stream as any).readableEnded) {
      throw new Error("stream has emmited 'error' or 'end' already");
    }

    return new Promise((resolve, reject) => {
      const removeListeners = () => {
        stream.removeListener("readable", readableListener);
        stream.removeListener("error", errorListener);
      };

      const readableListener = () => {
        removeListeners();
        resolve(true);
      };

      const errorListener = (err: Error) => {
        removeListeners();
        reject(err);
      };
      stream.once("readable", readableListener).once("error", errorListener);
    });
  };

  let raw = Buffer.alloc(0);
  const deadline = Date.now() + timeout;
  while (raw.length < size) {
    await readable(stream);
    // https://nodejs.org/api/stream.html#stream_readable_read_size
    // Readable.readは指定したサイズのデータが取得できない場合はnullを返す
    // readのサイズが指定されない場合はバッファ内に存在する全てのデータを返す
    // const chunk = (stream.read(size - raw.length) ??
    //   stream.read()) as Buffer | null;

    const readWithSize = stream.read(size - raw.length);

    // console.log({ readWithSize });
    let readWoSize;
    if (readWithSize === null) {
      readWoSize = stream.read();
    }
    const chunk = (readWithSize ?? readWoSize) as Buffer | null;
    // console.log({ chunk });
    if (chunk === null) break;
    raw = Buffer.concat([raw, chunk]);
  }
  return raw;
}
