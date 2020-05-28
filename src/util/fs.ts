/**
 * File system / path 周りのユーティリティ
 */
import { Stats } from "fs";
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
 */
export function eachFile(pathname: Pathname) {
  return pathname.split(path.sep);
}
