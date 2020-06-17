import * as path from "path";
import { OID, Pathname } from "../types";
import { Stats } from "fs";
import { isExecutable, descend } from "../util";
// prettier-ignore
type EntryConstructor = (
  citme: number, ctimeNsec: number, mtime: number, mtimeNsec: number,
  dev: number, ino: number, mode: 0o0100644 | 0o0100755,
  uid: number, gid: number, size: number,
  oid: OID, flags: number, name: Pathname
) => void

// prettier-ignore
type EntryConstructorParameters = Parameters<EntryConstructor>

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

export const STAGES = [0, 1, 2, 3] as const;
export type Stage = typeof STAGES[number];
export type Key = readonly [Pathname, Stage];

export class Entry {
  static readonly REGULAR_MODE = 0o0100644;
  static readonly EXECUTABLE_MODE = 0o0100755;
  static readonly MAX_PATH_SIZE = 0xfff;
  static readonly BLOCK_SIZE = 8;
  static readonly MIN_SIZE = 64;
  static readonly META_SIZE = 4;
  static readonly META_COUNT = 10;
  static readonly OID_SIZE = 20;
  static readonly FILE_LENGTH_SIZE = 2;

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
  /**
   * 2バイト
   * 0            0        11    000000000101
   * assume-valid extended stage name length
   * flag         flag
   */
  flags: number;
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

  static create(name: Pathname, oid: OID, stat: Stats) {
    const mode = this.modeForStat(stat);
    // nameはasciiのみ想定
    const flags = Math.min(name.length, this.MAX_PATH_SIZE);
    const ctime = this.statTimeToIndexTime(stat.ctimeMs);
    const mtime = this.statTimeToIndexTime(stat.mtimeMs);
    // https://nodejs.org/api/fs.html#fs_class_fs_stats
    // NodeJSのStats時刻はmilli second
    // prettier-ignore
    return new Entry(
      ctime, 0, mtime, 0,
      stat.dev, stat.ino, mode,
      stat.uid, stat.gid, stat.size,
      oid, flags, name
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
    return path.basename(this.name);
  }

  get mode() {
    return this.mod;
  }

  get parentDirectories() {
    return descend(path.dirname(this.name));
  }

  get key(): Key {
    return [this.name, this.stage];
  }

  // 2バイトフラグ中の 3 bits
  get stage() {
    return ((this.flags >> 12) & 0b11) as Stage;
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
    const length = data.readUInt16BE(metaLength + Entry.OID_SIZE);
    const filenameOffset = metaLength + Entry.OID_SIZE + Entry.FILE_LENGTH_SIZE;
    const name = data.slice(filenameOffset, filenameOffset + length).toString();
    return [...meta, oid, length, name] as EntryConstructorParameters;
  }

  /**
   * ファイルメタ情報をビッグエンディアン形式でバッファへ書き込む
   * 32bitを超える値の場合は32bitになるように上位ビットを切り取る
   */
  private pack() {
    const filenameLength = this.name.length;

    const metaLength = Entry.META_SIZE * Entry.META_COUNT;
    const sha1Length = Entry.OID_SIZE;
    const fileSizeLength = Entry.FILE_LENGTH_SIZE;
    const sha1Offset = metaLength;
    const fileSizeOffset = sha1Offset + sha1Length;
    const filenameOffset = fileSizeOffset + fileSizeLength;
    const bufferSize =
      metaLength + sha1Length + fileSizeLength + filenameLength;
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

    // file name
    // ファイルサイズ(2byte) + ファイル名
    buffer.writeUInt16BE(filenameLength, fileSizeOffset);
    buffer.write(this.name, filenameOffset, filenameLength);

    return buffer;
  }
}

function serialize(key: [string, number]) {
  return `${key[0]}.${key[1]}`;
}
