/**
 * File system / path 周りのユーティリティ
 */
import { constants, Stats } from "fs";
import { FileHandle, open } from "fs/promises";
import * as path from "path";
import { Pathname } from "../types";

export function isExecutable(stat: Stats) {
  const modeBin = stat.mode.toString(2);
  const user = modeBin.slice(7, 10);
  const isExecutable = 0b001 & Number.parseInt(user, 2);
  return isExecutable === 1;
}

/**
 * パスを親から子供へ辿っていったときの各パス名一覧を取得します。ファイルシステムへはアクセスしません。
 * Rubyの Pathname#descend相当
 * https://apidock.com/ruby/Pathname/descend
 *
 * @param pathname ファイルパス
 *
 * @example ディレクトリの深さ2以上のパス
 * > descend("/home/username/a.txt")
 * ["/home", "/home/username", "/home/username/a.txt"]
 */
export function descend(pathname: Pathname) {
  const eachDirname = pathname.split(path.sep).filter((s) => s !== ".");
  const initial = path.isAbsolute(pathname) ? "/" : "";
  return eachDirname.reduce((acc, dirname) => {
    const prev = acc[acc.length - 1] ?? initial;
    acc.push(path.join(prev, dirname));
    return acc;
  }, [] as string[]);
}

/**
 * パスを子から親へ辿っていったときの各パス名一覧を取得します。ファイルシステムへはアクセスしません。
 * Rubyの Pathname#descend相当
 * https://apidock.com/ruby/Pathname/descend
 *
 * @param pathname ファイルパス
 *
 * @example ディレクトリの深さ2以上のパス
 * > ascend("/home/username/a.txt")
 * ["/home/username/a.txt", "/home/username", "/home"]
 */
export function ascend(pathname: Pathname) {
  return descend(pathname).reverse();
}

/**
 * ファイルパスの各コンポーネントをリストとして取得します
 *
 * @example
 * > eachFile("/usr/bin/ruby")
 * ["usr", "bin", "ruby"]
 */
export function eachFile(pathname: Pathname) {
  return pathname.split(path.sep);
}

const whence = ["SEEK_CUR", "SEEK_SET"] as const;
export type Whence = typeof whence[number];
export interface Seekable {
  seek(pos: number, whence?: Whence): void;
  read(size: number): Promise<Buffer>;
  readNonblock(size: number): Promise<Buffer>;
  readByte(): Promise<number | null>;
  readableEnded: boolean;
}

export class FileSeeker implements Seekable {
  #handle: FileHandle;
  #offset = 0;

  static async fromPath(pathname: string): Promise<Seekable> {
    const handle = await open(pathname, constants.O_RDONLY);
    return new this(handle);
  }

  private constructor(handle: FileHandle) {
    this.#handle = handle;
  }

  seek(offset: number, whence?: Whence): void {
    switch (whence) {
      case "SEEK_CUR":
        this.#offset += offset;
        break;
      case "SEEK_SET":
      default:
        this.#offset = offset;
    }
  }

  private async _read(size: number, offset?: number): Promise<Buffer> {
    if (offset !== undefined) {
      this.#offset = offset;
    }
    const { buffer } = await this.#handle.read(
      Buffer.alloc(size),
      0,
      size,
      this.#offset,
    );
    this.#offset += size;
    return buffer;
  }

  async read(size: number): Promise<Buffer> {
    return this._read(size, this.#offset);
  }

  async readNonblock(size: number): Promise<Buffer> {
    return this._read(size, this.#offset);
  }

  async readByte(): Promise<number> {
    return (await this.read(1))[0];
  }

  get readableEnded(): boolean {
    return false;
  }
}
