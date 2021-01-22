import * as numbers from "./numbers";

/**
 * XDeltaアルゴリズムのCopy操作 (7バイト/56bit)
 * offsetは4バイト, sizeは3バイトとなる
 *  -- -- -- -- -- -- --
 * |   offset  |  size  |
 *  -- -- -- -- -- -- --
 *
 */
export class Copy {
  readonly type = "copy";
  constructor(public readonly offset: number, public readonly size: number) {}

  toString(): string {
    const bytes = numbers.PackedInt56LE.write(
      this.size * 2 ** 32 + this.offset
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
  constructor(public readonly data: Buffer) {}

  toString(): string {
    const size = Buffer.of(this.data.byteLength);

    return Buffer.concat([size, this.data]).toString("binary");
  }
}
