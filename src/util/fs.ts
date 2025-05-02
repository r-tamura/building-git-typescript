/**
 * File system / path 周りのユーティリティ
 */
import { constants, Stats } from "fs";
import { FileHandle, open } from "fs/promises";
import * as path from "path";
import { Pathname } from "../types";
import { asserts } from "./assert";

export function isExecutable(stat: Stats) {
  const modeBin = stat.mode.toString(2);
  const user = modeBin.slice(7, 10);
  const isExecutable = 0b001 & Number.parseInt(user, 2);
  return isExecutable === 1;
}

function guessPathSeparator(pathname: Pathname): typeof path.sep {
  const includesWindowsPathSep = pathname.includes("\\");
  const includesUnixPathSep = pathname.includes("/");
  if (includesWindowsPathSep && includesUnixPathSep) {
    throw new Error("path separator is ambiguous");
  }
  if (includesWindowsPathSep) {
    return "\\";
  }
  if (includesUnixPathSep) {
    return "/";
  }
  return "/"
}

/**
 * 実行環境によらずUnix形式のパスを取得します
 *
 * refファイルではOSに依存せずUnix形式のパスを扱います
 *
 * 例: HEADファイルは ref: refs/heads/master という形式で保存されます
 */
export function descendUnix(pathname: Pathname): string[] {
  const UNIX_PATH_SEP = "/";
  const sep = guessPathSeparator(pathname);
  if (sep === "\\") {
    throw new Error("Windows形式のパスはUnix形式に変換できません");
  }
  const eachDirname = pathname.split(sep).filter((s) => s !== ".");
  const initial = path.isAbsolute(pathname) ? "/" : "";
  return eachDirname.reduce((acc, dirname) => {
    const prev = acc[acc.length - 1] ?? initial;
    if (prev === "") {
      acc.push(dirname);
      return acc;
    } else {
      acc.push([prev, dirname].join(UNIX_PATH_SEP));
      return acc;
    }
  }, [] as string[]);
}


/**
 * パスを親から子供へ辿っていったときの各パス名一覧を取得します。ファイルシステムへはアクセスしません。
 * Rubyの Pathname#descend相当
 * https://apidock.com/ruby/Pathname/descend
 *
 * @param pathname ファイルパス
 *
 * @example ディレクトリの深さ2以上のパス(Unix形式)
 * > descend("/home/username/a.txt")
 * ["/home", "/home/username", "/home/username/a.txt"]
 *
 * @example ディレクトリの深さ2以上のパス(Windows形式)
 * > descend("C:\\home\\username\\a.txt")
 * ["C:\\home", "C:\\home\\username", "C:\\home\\username\\a.txt"]
 */
export function descend(pathname: Pathname) {
  const eachDirname = pathname.split(path.sep).filter((s) => s !== ".");
  const initial = path.isAbsolute(pathname) ? path.sep : "";
  return eachDirname.reduce((acc, dirname) => {
    const prev = acc[acc.length - 1] ?? initial;
    acc.push(path.join(prev, dirname));
    return acc;
  }, [] as string[]);
}

/**
 * ascendと同じですが、Unix形式のパスを返します
 * Windows形式のパスは変換できません
 * @returns Unix形式のパス名一覧
 */
export function ascendUnix(pathname: Pathname): string[] {
  return descendUnix(pathname).reverse();
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
export function toPathComponentsPosix(pathname: PosixPath) {
  return pathname.split("/");
}

const posixPathSymbol = Symbol("Posix path branded type symbol");
export type PosixPath = string & { [posixPathSymbol]: unknown }

/**
 * POSIX形式のファイルパスを作成します
 * Windows形式のパスが渡されたときはPOSIX形式に変換されます
 * @param pathname ファイルパス
 * @returns POSIX形式のファイルパス
 */
export function posixPath(pathname: Pathname): PosixPath {

  const guessedSep = guessPathSeparator(pathname);

  switch (guessedSep) {
    case "/":
      // Unix形式のパスはそのまま返す
      return pathname as PosixPath;
    case "\\": {
      // Windows形式のパスはUnix形式に変換する
      const unixPath = pathname.split("\\").join("/");
      return unixPath as PosixPath;
    }
    default:
      throw new Error(`path separator is ambiguous, got '${pathname}'`);
  }
}

const osPathSymbol = Symbol("OsPath");
export type OsPath = string & { [osPathSymbol]: unknown };

/**
 *
 * @param pathname
 */
export function osPath(pathname: Pathname): OsPath {
  const guessedSep = guessPathSeparator(pathname);
  asserts(guessedSep !== "\\", "アプリケーション内部ではPosix形式パスを利用してください");

  const osPath = pathname.replace("/", path.sep);
  return osPath as OsPath;
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
