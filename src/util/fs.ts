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
    throw new Error(`path separator is ambiguous: '${pathname}'`);
  }
  if (includesWindowsPathSep) {
    return "\\";
  }
  if (includesUnixPathSep) {
    return "/";
  }
  return "/";
}

/**
 * 実行環境によらずUnix形式のパスを取得します
 *
 * refファイルではOSに依存せずUnix形式のパスを扱います
 * Windows形式のパスが渡されたとき、エラーを投げます
 *
 * 例: HEADファイルは ref: refs/heads/master という形式で保存されます
 *
 * @example
 * ```ts
 * import { descendUnix } from "./fs";
 * descendUnix("/home/username/a.txt")
 * // => ["/home", "/home/username", "/home/username/a.txt"]
 * ```
 */
export function descendUnix(pathname: Pathname): string[] {
  const UNIX_PATH_SEP = "/";
  const sep = guessPathSeparator(pathname);
  if (sep === "\\") {
    throw new Error("Windows形式のパスはUnix形式に変換できません");
  }
  // const eachDirname = pathname.split(UNIX_PATH_SEP).filter((s) => s !== ".");
  // const initial = path.isAbsolute(pathname) ? UNIX_PATH_SEP : "";
  // const allDirs = eachDirname.reduce((acc, dirname) => {
  //   const prev = acc[acc.length - 1] ?? initial;
  //   acc.push(path.posix.join(prev, dirname));
  //   return acc;
  // }, [] as string[]);
  // // ルートディレクトリは含めない
  // return allDirs.filter((s) => s !== UNIX_PATH_SEP);

  // ルートディレクトリになるまで、path.posix.dirnameを適用した結果を配列に詰める
  // 前回値と変化がなくなったら終了
  const allDirs = [pathname];
  let current = pathname;
  let prev = null;
  while (current !== prev) {
    prev = current;
    current = path.posix.dirname(current);
    allDirs.push(current);
  }
  return allDirs.filter((s) => s !== UNIX_PATH_SEP && s !== ".").reverse();
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
  const sep = guessPathSeparator(pathname);
  asserts(path.sep === sep, "実行環境のOSに対応したパス形式を利用してください");
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
 *
 * @example ディレクトリの深さ2以上のパス(Unix形式)
 *
 * ```ts
 * > ascendUnix("/home/username/a.txt")
 * ["/home", "/home/username", "/home/username/a.txt"]
 * ```
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
export type PosixPath = string & { [posixPathSymbol]: unknown };

export function posixJoin(...paths: Pathname[]): PosixPath {
  const posixPaths = paths.map(posixPath);
  const p = path.posix.join(...posixPaths);
  return posixPath(p);
}

/**
 * PosixPathを受け取り、PosixPathで返すpath.posix.resolveのラッパー
 */
export function posixResolve(...paths: PosixPath[]): PosixPath {
  const resolved = path.posix.resolve(...paths);
  return resolved as PosixPath;
}

/**
 * PosixPathを受け取り、PosixPathで返すpath.posix.relativeのラッパー
 */
export function posixRelative(from: PosixPath, to: PosixPath): PosixPath {
  const rel = path.posix.relative(from, to);
  return rel as PosixPath;
}

/**
 * PosixPathを受け取り、PosixPathで返すpath.posix.dirnameのラッパー
 */
export function posixDirname(p: PosixPath): PosixPath {
  const dir = path.posix.dirname(p);
  return dir as PosixPath;
}

/**
 * PosixPathを受け取り、PosixPathで返すpath.posix.basenameのラッパー
 */
export function posixBasename(p: PosixPath, ext?: string): PosixPath {
  const base = path.posix.basename(p, ext);
  return base as PosixPath;
}

/**
 * PosixPathを受け取り、拡張子(string)を返すpath.posix.extnameのラッパー
 */
export function posixExtname(p: PosixPath): string {
  return path.posix.extname(p);
}

function removeWin32PathDrive(pathname: Pathname): Pathname {
  const drive = pathname.slice(0, 2);
  if (drive[0].match(/^[A-Z]$/) && drive[1] === ":") {
    // ドライブ名付き絶対パス
    // 例: C:\path\to\file.txt => path\to\file.txt
    return pathname.slice(2);
  } else {
    // ドライブ名なし絶対パスまたは相対パス
    // 例: \path\to\file.txt => \path\to\file.txt
    //     .\path\to\file.txt => .\path\to\file.txt
    return pathname;
  }
}

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
      // Windows形式のパスはPosix形式に変換する
      const win32PathWithoutDrive = removeWin32PathDrive(pathname);
      const unixPath = win32PathWithoutDrive.replaceAll("\\", "/");
      return unixPath as PosixPath;
    }
    default:
      throw new Error(`path separator is ambiguous, got '${pathname}'`);
  }
}

export const POSIX_PATH_ZERO = posixPath("");

const osPathSymbol = Symbol("OsPath");
export type OsPath = string & { [osPathSymbol]: unknown };

/**
 * アプリケーション内部で利用するPosix形式のパスをOS形式のファイルパスへ変換します
 * 実行環境と同一形式のパスが渡されたときパスは変換されません
 *
 * @param pathname ファイルパス
 *
 * @example Windows環境でPosix形式のパスを引数へ渡したとき
 *
 * ```ts
 * import { osPath } from "./util/fs";
 * const path = osPath(posixPath("/home/username/a.txt"));
 * // => "\\home\\username\\a.txt"
 * ```
 *
 * Note: Windows環境でドライブをしていない場合の絶対パスの扱い
 *
 * 下記のようなパスをファイルシステムのAPIに渡すと、プロセスのcwdのドライブのパスとして解釈される。
 * このアプリケーションではWindows環境でプロセスのcwd以外のドライブを扱うことは想定しない。
 *
 * ```ts
 * import * as fs from "node:fs";
 *
 * async function f() {
 *    const res = await fs.promises.readdir("\\path\\to\\your\\dir")
 *    console.dir(res, { depth: null })
 * }
 *
 * f();
 * ```
 *
 */
export function toOsPath(pathname: Pathname): OsPath {
  const guessedSep = guessPathSeparator(pathname);
  asserts(
    guessedSep !== "\\",
    "アプリケーション内部ではPosix形式パスを利用してください",
  );

  const parsed = path.posix.parse(pathname);
  const osPathStr = path.format({
    ...parsed,
    root: path.sep,
    base: parsed.base.replaceAll("/", path.sep),
    dir: parsed.dir.replaceAll("/", path.sep),
  });
  return osPathStr as OsPath;
}

/**
 * OS形式のパスであることを保証します
 * `toOsPath`関数とは異なり、パス形式の変換は行いません
 */
export function asOsPath(pathname: Pathname): OsPath {
  const guessedSep = guessPathSeparator(pathname);
  if (guessedSep !== path.sep) {
    throw new TypeError(
      `OS形式のパスを利用してください。OSのパスセパレータ: ${path.sep}, 受け取ったパス: ${pathname}`,
    );
  }
  return pathname as OsPath;
}

const whence = ["SEEK_CUR", "SEEK_SET"] as const;
export type Whence = (typeof whence)[number];
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
