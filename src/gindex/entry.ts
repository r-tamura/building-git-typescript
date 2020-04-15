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

// prettier-ignore
type EntryConstructor = (
  citme: number, ctimeNsec: number, mtime: number, mtimeNsec: number,
  dev: number, ino: number, mode: number,
  uid: number, gid: number, size: number,
  oid: OID, flags: number, pathname: Pathname
) => void

// prettier-ignore
type EntryConstructorParameters = Parameters<EntryConstructor>

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

  private constructor(
    // prettier-ignore
    ...[
      ctime, ctimeNsec, mtime, mtimeNsec,
      dev, ino, mode,
      uid, gid, size,
      oid,flags, pathname,
    ]: EntryConstructorParameters
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
    // prettier-ignore
    return new Entry(
      ctime, 0, mtime, 0,
      stat.dev, stat.ino, mode,
      stat.uid, stat.gid, stat.size,
      oid, flags, pathname
    );
  }

  static parse(data: Buffer) {
    const args = this.unpack(data);
    return new Entry(...args);
  }

  get key() {
    return this.pathname;
  }

  toString() {
    const packed = this.pack();
    return packed.toString("binary");
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
    const pathname = data
      .slice(filenameOffset, filenameOffset + length)
      .toString();
    return [...meta, oid, length, pathname] as EntryConstructorParameters;
  }

  /**
   * ファイルメタ情報をビッグエンディアン形式でバッファへ書き込む
   * 32bitを超える値の場合は32bitになるように上位ビットを切り取る
   */
  private pack() {
    const filenameLength = this.pathname.length;

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
      "mode",
      "uid",
      "gid",
      "size",
    ];
    for (const [i, name] of orderToWrite.entries()) {
      buffer.writeUInt32BE(this[name] & 0xffffffff, i * Entry.META_SIZE);
    }

    // OID
    buffer.write(this.oid, sha1Offset, Entry.OID_SIZE, "hex");

    // file name
    // ファイルサイズ(2byte) + ファイル名
    buffer.writeUInt16BE(filenameLength, fileSizeOffset);
    buffer.write(this.pathname, filenameOffset, filenameLength);

    return buffer;
  }
}
