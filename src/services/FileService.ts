import * as CallbackFs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import * as zlib from "node:zlib";
import { Pathname } from "../types.ts";
import { BaseError } from "../util/index.ts";
const fs = CallbackFs.promises;

export type FileService = Pick<
  typeof fs,
  | "access"
  | "chmod"
  | "mkdir"
  | "open"
  | "readdir"
  | "readFile"
  | "rename"
  | "stat"
  | "unlink"
  | "writeFile"
  | "rm"
  | "rmdir"
>;

export const defaultFs = createPassthroughFileService();

export async function exists(fs: FileService, pathname: Pathname) {
  try {
    await fs.access(pathname);
    return true;
  } catch {
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
        await fs.rm(pathname, { recursive: true });
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
  pathname: Pathname,
): Promise<string[]> {
  const parent = pathname;
  const entries = await fs.readdir(parent);
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(parent, entry);
    const stat = await fs.stat(entryPath);
    if (stat.isDirectory()) {
      const children = await readdirRecursive(fs, entryPath);
      files.push(...children);
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
  options: Parameters<Deflate>[1],
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
  encoding: BufferEncoding = "utf8",
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
  encoding: BufferEncoding = "utf8",
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
  encoding: BufferEncoding = "utf8",
): Promise<readline.Interface> {
  const fileStream = await createReadStreamSafe(pathname, encoding);
  return readline.createInterface({
    input: fileStream,
  });
}

export class TimeoutError extends BaseError {}

interface ReadChunkOptions {
  /**
   * 読み込み処理タイムアウト(ms)
   * @default 3000
   * */
  timeout?: number;
  /**
   * 指定サイズが読み込めない場合にブロックするか
   * @default true
   * */
  block?: boolean;
}

/**
 * ReadableStreamから指定されたバイト数分のデータを読み込みます。
 *
 * ReadableStreamのバッファに指定サイズより少ないデータしかなく、ストリームからこれ以上読み込むデータがない場合、そのデータを全て返します。
 *
 * See: https://nodejs.org/api/stream.html#stream_readable_read_size
 * The readable.read() method pulls some data out of the internal buffer and returns it.
 * If no data available to be read, null is returned. By default, the data will be returned as a Buffer object
 * unless an encoding has been specified using the readable.setEncoding() method or the stream is operating in object mode.
 * The optional size argument specifies a specific number of bytes to read. If size bytes are not available to be read,
 * null will be returned unless the stream has ended, in which case all of the data remaining in the internal buffer will be returned.
 *
 * @param stream
 * @param size 読み込みバイト数
 * @param timeout タイムアウト(ms)
 */
export async function readChunk(
  stream: NodeJS.ReadableStream,
  size: number,
  { timeout = 3000, block = true }: ReadChunkOptions = {},
): Promise<Buffer> {
  /**
   * stream の "readable" を待つ。
   * 戻り値: true = 読める / false = 終端 (もう来ない)
   *
   * stream がすでに end している場合は false を返す。errorは reject。
   * subprocess の stdout のような外部 stream は、相手が exit すると
   * end イベントを発し readableEnded が true になるので、それを正しく
   * 終端として扱う必要がある。
   *
   * https://nodejs.org/api/stream.html#stream_readable_readableended
   */
  const waitReadable = async (
    stream: NodeJS.ReadableStream,
  ): Promise<boolean> => {
    // TypeScriptのNodeJS型定義にreadableEndedが定義されていない
    if ((stream as any).readableEnded) {
      return false;
    }

    return new Promise<boolean>((resolve, reject) => {
      const removeListeners = () => {
        stream.removeListener("readable", readableListener);
        stream.removeListener("end", endListener);
        stream.removeListener("error", errorListener);
      };
      const readableListener = () => {
        removeListeners();
        resolve(true);
      };
      const endListener = () => {
        removeListeners();
        resolve(false);
      };
      const errorListener = (err: Error) => {
        removeListeners();
        reject(err);
      };
      stream
        .once("readable", readableListener)
        .once("end", endListener)
        .once("error", errorListener);
    });
  };

  const read = (stream: NodeJS.ReadableStream, size: number): Buffer | null =>
    stream.read(size) as Buffer | null;

  let raw = read(stream, size);

  if (!block && raw !== null && raw.byteLength < size) {
    // ReadableStreamバッファの最後のデータ
    return raw;
  }

  const deadline = Date.now() + timeout;
  while (raw === null) {
    if (Date.now() > deadline) {
      const streamBuffer = stream.read() as Buffer | null;
      throw new TimeoutError(
        "timeout error: " +
          JSON.stringify({
            buffer: streamBuffer,
            string: streamBuffer?.toString("binary"),
            bufferSize: streamBuffer?.byteLength ?? 0,
            size,
          }),
      );
    }

    const hasMore = await waitReadable(stream);
    raw = read(stream, size);

    if (raw === null) {
      if (!hasMore) {
        // 終端: 残バッファがあれば取り出す。なければ空 Buffer を返して呼び出し側の
        // length チェックで EOF を判断させる
        raw = (stream.read() as Buffer | null) ?? Buffer.alloc(0);
        break;
      }
      if (block === false) {
        raw = (stream.read() as Buffer | null) ?? Buffer.alloc(0);
        break;
      }
    }
  }
  return raw;
}

export function createPassthroughFileService(): FileService {
  return {
    access: fs.access,
    chmod: fs.chmod,
    mkdir: fs.mkdir,
    open: fs.open,
    readdir: fs.readdir,
    readFile: fs.readFile,
    rename: fs.rename,
    stat: fs.stat,
    unlink: fs.unlink,
    writeFile: fs.writeFile,
    rm: fs.rm,
    rmdir: fs.rmdir,
  };
}
