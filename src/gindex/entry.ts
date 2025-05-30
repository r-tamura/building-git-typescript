import { Stats } from "fs";
import * as path from "path";
import * as Database from "../database";
import { MODE } from "../entry";
import { OID, Pathname } from "../types";
import { asserts, descendUnix, isExecutable } from "../util";

// Git indexファイルのフォーマット仕様
// https://github.com/git/git/blob/master/Documentation/technical/index-format.txt

// prettier-ignore
type EntryConstructor = (
  citme: number, ctimeNsec: number, mtime: number, mtimeNsec: number,
  dev: number, ino: number, mode: 0o0100644 | 0o0100755,
  uid: number, gid: number, size: number,
  oid: OID, flags: number, name: Pathname
) => void

type EntryConstructorParameters = Parameters<EntryConstructor>;

/** Entry中のfile stat系の属性 */
type EntryStats = Pick<
  Entry,
  | "ctime"
  | "ctimeNsec"
  | "mtime"
  | "mtimeNsec"
  | "dev"
  | "ino"
  | "mod"
  | "uid"
  | "gid"
  | "size"
  | "flags"
>;

/**
 * 2バイトのフラグ構成 indexレコード内のOIDとファイル名の間に置かれる
 * 0            0        11    000000000101
 * assume-valid extended stage name length
 * flag         flag
 */
export type Flags = number;
export const NORMAL = 0;
export const BASE = 1;
export const LEFT = 2;
export const RIGHT = 3;
export const STAGES = [NORMAL, BASE, LEFT, RIGHT] as const;
export type Stage = (typeof STAGES)[number];
export type Key = readonly [Pathname, Stage];

interface FileStats {
  ctime: number;
  ctimeNsec: number;
  mtime: number;
  mtimeNsec: number;
  dev: number;
  ino: number;
  mod: 0o0100644 | 0o0100755;
  uid: number;
  gid: number;
  size: number;
  flags: number;
}

function fileStats(stats: FileStats): FileStats {
  return {
    ctime: stats.ctime,
    ctimeNsec: stats.ctimeNsec,
    mtime: stats.mtime,
    mtimeNsec: stats.mtimeNsec,
    dev: stats.dev,
    ino: stats.ino,
    mod: stats.mod,
    uid: stats.uid,
    gid: stats.gid,
    size: stats.size,
    flags: stats.flags,
  };
}

export class Entry {
  static readonly REGULAR_MODE = 0o0100644;
  static readonly EXECUTABLE_MODE = 0o0100755;
  static readonly MAX_PATH_SIZE = 0xfff;
  static readonly BLOCK_SIZE = 8;
  static readonly MIN_SIZE = 64;
  static readonly META_SIZE = 4;
  static readonly META_COUNT = 10;
  static readonly OID_SIZE = 20;
  static readonly FLAGS_SIZE = 2;

  readonly type = "index";
  ctime: number;
  ctimeNsec: number;
  mtime: number;
  mtimeNsec: number;
  dev: number;
  ino: number;
  mod: 0o0100644 | 0o0100755;
  uid: number;
  gid: number;
  size: number;
  flags: Flags;
  oid: OID;
  name: Pathname;

  private constructor(
    // prettier-ignore
    ...[
      ctime, ctimeNsec, mtime, mtimeNsec,
      dev, ino, mode,
      uid, gid, size,
      oid,flags, name,
    ]: EntryConstructorParameters
  ) {
    /** seconds, the last time a file's metadata changed) */
    this.ctime = ctime;
    this.ctimeNsec = ctimeNsec;
    /** seconds, the last time a file's data changed) */
    this.mtime = mtime;
    this.mtimeNsec = mtimeNsec;
    this.dev = dev;
    // mode アクセサと命名が重なるためmod
    this.mod = mode;
    this.ino = ino;
    this.uid = uid;
    this.gid = gid;
    this.size = size;
    this.oid = oid;
    this.flags = flags;
    this.name = name;
  }

  static create(pathname: Pathname, oid: OID, stat: Stats) {
    const mode = this.modeForStat(stat);
    // nameはasciiのみ想定 (コンフリクト時以外はstage-0なので, flagsはファイル名の長さだけになる)
    const flags = Math.min(pathname.length, this.MAX_PATH_SIZE);
    const ctime = this.statTimeToIndexTime(stat.ctimeMs);
    const mtime = this.statTimeToIndexTime(stat.mtimeMs);
    // https://nodejs.org/api/fs.html#fs_class_fs_stats
    // NodeJSのStats時刻はmilli second
    // prettier-ignore
    return new Entry(
      ctime, 0, mtime, 0,
      stat.dev, stat.ino, mode,
      stat.uid, stat.gid, stat.size,
      oid, flags, pathname
    );
  }

  /**
   * objectsエントリからindexのエントリを作成します
   * @param pathname ファイルパス
   * @param item objectsエントリ
   * @param n Stage
   */
  static createFromDb(pathname: Pathname, item: Database.Entry, n: Stage) {
    // n: 2bit
    // file name length: 12bit
    // @example ステージ3の場合のflags
    //  11000000000000 = 3 << 12 = 12288
    //|            101 = 5
    //  ----------------
    //  11000000000101      = 12293
    const flags = (n << 12) | Math.min(pathname.length, this.MAX_PATH_SIZE);
    asserts(
      item.mode !== MODE.directory,
      "indexファイルのエントリはファイルのみ",
    );
    return new this(
      0,
      0,
      0,
      0,
      0,
      0,
      item.mode,
      0,
      0,
      0,
      item.oid,
      flags,
      pathname,
    );
  }

  static parse(data: Buffer) {
    const args = this.unpack(data);
    return new Entry(...args);
  }

  static modeForStat(stat: Stats) {
    return isExecutable(stat) ? this.EXECUTABLE_MODE : this.REGULAR_MODE;
  }

  get basename() {
    return path.posix.basename(this.name);
  }

  get mode() {
    return this.mod;
  }

  get parentDirectories() {
    return descendUnix(path.posix.dirname(this.name));
  }

  get key(): Key {
    return [this.name, this.stage];
  }

  // 2バイトフラグ中の 2 bit
  get stage() {
    return extractStage(this.flags);
  }

  // 2バイトフラグ中の 12 bit
  get filenameLength() {
    return extractFilenameLength(this.flags);
  }

  statMatch(stat: Stats) {
    const sizeMatch = this.size === 0 || this.size === stat.size;
    const modeMatch = Entry.modeForStat(stat) === this.mode;
    return sizeMatch && modeMatch;
  }

  timesMatch(stat: Stats) {
    const ctimeMatch = Entry.statTimeToIndexTime(stat.ctimeMs) === this.ctime;
    const mtimeMatch = Entry.statTimeToIndexTime(stat.mtimeMs) === this.mtime;
    return ctimeMatch && mtimeMatch;
  }

  updateStat(stat: Stats) {
    this.ctime = Entry.statTimeToIndexTime(stat.ctimeMs);
    this.mtime = Entry.statTimeToIndexTime(stat.mtimeMs);
    this.dev = stat.dev;
    this.ino = stat.ino;
    this.mod = Entry.modeForStat(stat);
    this.uid = stat.uid;
    this.gid = stat.gid;
    this.size = stat.size;
  }

  toString() {
    const packed = this.pack();
    return packed.toString("binary");
  }

  private static statTimeToIndexTime(timeMs: number) {
    return Math.floor(timeMs / 1000);
  }

  private static unpack(data: Buffer) {
    // ファイルメタデータ
    const metaLength = Entry.META_SIZE * Entry.META_COUNT;
    const meta: number[] = [];
    for (let i = 0; i < metaLength; i += Entry.META_SIZE) {
      meta.push(data.readUInt32BE(i));
    }
    // oid
    const oid = data
      .slice(metaLength, metaLength + Entry.OID_SIZE)
      .toString("hex");

    // file name
    const flags = data.readUInt16BE(metaLength + Entry.OID_SIZE);
    const filenameOffset = metaLength + Entry.OID_SIZE + Entry.FLAGS_SIZE;
    const filenameLength = extractFilenameLength(flags);
    const name = data
      .slice(filenameOffset, filenameOffset + filenameLength)
      .toString();
    return [...meta, oid, flags, name] as EntryConstructorParameters;
  }

  /**
   * ファイルメタ情報をビッグエンディアン形式でバッファへ書き込む
   * 32bitを超える値の場合は32bitになるように上位ビットを切り取る
   */
  private pack() {
    const filenameLength = this.name.length;
    const metaLength = Entry.META_SIZE * Entry.META_COUNT;
    const sha1Offset = metaLength;
    const fileSizeOffset = sha1Offset + Entry.OID_SIZE;
    const filenameOffset = fileSizeOffset + Entry.FLAGS_SIZE;
    const bufferSize =
      metaLength + Entry.OID_SIZE + Entry.FLAGS_SIZE + filenameLength;
    const padCount = Entry.BLOCK_SIZE - (bufferSize % Entry.BLOCK_SIZE);

    // File metadata
    const buffer = Buffer.alloc(bufferSize + padCount);
    const orderToWrite: (keyof EntryStats)[] = [
      "ctime",
      "ctimeNsec",
      "mtime",
      "mtimeNsec",
      "dev",
      "ino",
      "mod",
      "uid",
      "gid",
      "size",
    ];
    for (const [i, name] of orderToWrite.entries()) {
      const v = this[name];
      buffer.writeUInt32BE(v & 0xffffffff, i * Entry.META_SIZE);
    }

    // OID
    buffer.write(this.oid, sha1Offset, Entry.OID_SIZE, "hex");

    // flags + file name
    // assume valid flag(1bit) + extended flag(1bit) + stage(2bit) + ファイルサイズ(12bts) + ファイル名
    buffer.writeUInt16BE(this.flags, fileSizeOffset);
    buffer.write(this.name, filenameOffset, filenameLength);
    return buffer;
  }
}

function extractStage(flags: Flags) {
  return ((flags >> 12) & 0b11) as Stage;
}

function extractFilenameLength(flags: Flags) {
  return flags & 0xfff;
}
