import { Pathname, OID } from "../types";
import { Stats } from "fs";
import { isExecutable } from "../util/fs";

type EntryField =
  | "ctime"
  | "ctimeNsec"
  | "mtime"
  | "mtimeNsec"
  | "dev"
  | "ino"
  | "mode"
  | "uid"
  | "gid"
  | "size"
  | "flags";
type EntryStats = Record<EntryField, number>;

export interface Entry extends EntryStats {
  oid: OID;
  pathname: Pathname;
}

export class Entry {
  static REGULAR_MODE = 0o0100644;
  static EXECUTABLE_MODE = 0o0100755;
  static MAX_PATH_SIZE = 0xfff;
  static BLOCK_SIZE = 8;

  private constructor(
    ctime: number,
    ctimeNsec: number,
    mtime: number,
    mtimeNsec: number,
    dev: number,
    ino: number,
    mode: number,
    uid: number,
    gid: number,
    size: number,
    oid: OID,
    flags: number,
    pathname: Pathname
  ) {
    /** seconds, the last time a file's metadata changed) */
    this.ctime = ctime;
    this.ctimeNsec = ctimeNsec;
    /** seconds, the last time a file's data changed) */
    this.mtime = mtime;
    this.mtimeNsec = mtimeNsec;
    this.dev = dev;

    this.mode = mode;
    this.ino = ino;
    this.uid = uid;
    this.gid = gid;
    this.size = size;
    this.oid = oid;
    this.flags = flags;
    this.pathname = pathname;
  }

  static create(pathname: Pathname, oid: OID, stat: Stats) {
    const mode = isExecutable(stat) ? this.EXECUTABLE_MODE : this.REGULAR_MODE;
    // pathnameはasciiのみ想定
    const flags = Math.min(pathname.length, this.MAX_PATH_SIZE);
    const ctime = Math.floor(stat.ctimeMs / 1000);
    const mtime = Math.floor(stat.mtimeMs / 1000);
    // https://nodejs.org/api/fs.html#fs_class_fs_stats
    // NodeJSのStats時刻はmilli second
    return new Entry(
      ctime,
      0,
      mtime,
      0,
      stat.dev,
      stat.ino,
      mode,
      stat.uid,
      stat.gid,
      stat.size,
      oid,
      flags,
      pathname
    );
  }

  get key() {
    return this.pathname;
  }

  toString() {
    const packed = this.pack();
    return packed.toString("binary");
  }

  /**
   * ファイルメタ情報をビッグエンディアン形式でバッファへ書き込む
   * 32bitを超える値の場合は32bitになるように上位ビットを切り取る
   */
  private pack() {
    const filenameLength = this.pathname.length;

    const metaLength = 40;
    const sha1Length = 20;
    const fileSizeLength = 2;
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
      "mode",
      "uid",
      "gid",
      "size",
    ];
    for (const [i, name] of orderToWrite.entries()) {
      buffer.writeUInt32BE(this[name] & 0xffffffff, i * 4);
    }

    // OID
    buffer.write(this.oid, 40, 20, "hex");

    // file name
    // ファイルサイズ(2byte) + ファイル名
    buffer.writeUInt16BE(filenameLength, fileSizeOffset);
    buffer.write(this.pathname, filenameOffset, filenameLength);

    return buffer;
  }
}
