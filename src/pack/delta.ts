import { asserts } from "../util";
import { Entry } from "./entry";
import * as numbers from "./numbers";
import { Unpacked } from "./windows";
import { Xdelta } from "./xdelta";

/**
 * XDeltaアルゴリズムのCopy操作 (7バイト/56bit)
 * source内でのoffsetとそこからのsizeで操作内容が決まる
 *
 * エンコーディングされるとoffsetは4バイト, sizeは3バイトとなる
 * +--------------------+
 * |   offset  |  size  |
 * +--------------------+
 */
export class Copy {
  readonly type = "copy";

  static isCopy(byte: number) {
    return byte >= 0x80;
  }

  static async parse(input: numbers.Readable, byte: number): Promise<Copy> {
    const value = await numbers.PackedInt56LE.read(input, byte);
    const offset = value & BigInt(0xfffffff);
    const size = value >> BigInt(32);
    return new Copy(Number(offset), Number(size));
  }

  constructor(public readonly offset: number, public readonly size: number) {}

  toString(): string {
    const bytes = numbers.PackedInt56LE.write(
      this.size * 2 ** 32 + this.offset,
    );
    // Copy操作は先頭1ビットが1
    bytes[0] |= 0x80;
    return bytes.toString("binary");
  }
}

/**
 * XDeltaアルゴリズムのInsert操作
 * 最大サイズは0x7F
 */
export class Insert {
  readonly type = "insert";

  static isInsert(byte: number) {
    return byte < 0x80;
  }

  static async parse(input: numbers.Readable, byte: number): Promise<Insert> {
    const bytes = await input.read(byte);
    asserts(bytes !== null);
    asserts(bytes.byteLength === byte);
    return new Insert(bytes);
  }

  constructor(public readonly data: Buffer) {}

  toString(): string {
    const size = Buffer.of(this.data.byteLength);

    return Buffer.concat([size, this.data]).toString("binary");
  }
}

export class Delta {
  base: Entry;
  data: Buffer;
  constructor(source: Unpacked, target: Unpacked) {
    this.base = source.entry;
    this.data = Buffer.concat([this.sizeof(source), this.sizeof(target)]);

    source.deltaIndex ??= Xdelta.createIndex(source.data);

    const delta = source.deltaIndex.compress(target.data);
    for (const op of delta) {
      this.data = Buffer.concat([
        this.data,
        Buffer.from(op.toString(), "binary"),
      ]);
    }
  }

  get length() {
    return this.data.length;
  }

  get byteLength() {
    return this.data.byteLength;
  }

  private sizeof(entry: Unpacked): Buffer {
    const bytes = numbers.VarIntLE.write(entry.size, 7);
    return bytes;
  }
}
