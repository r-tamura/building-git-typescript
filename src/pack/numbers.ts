/**
 * variable-length-integer, little-endian
 *
 * ```
 *        +-----+---------+---------+
 *   1000 | 1101| 10001011| 01101010|
 *     ** +-----+---------+---------+
 * ```
 * - **部分
 *   オブジェクトタイプ(Commit=1, Tree=2, Blob=3)
 *
 * - 囲まれた部分: エンコードされたオブジェクトサイズ
 * 最初のみ4bit (1101)
 * 残りは7bitずつ (0001011, 1101010)
 */

import { asserts } from "../util";
import { Stream } from "./stream";

export const MASK_FOR_FIRST = 0xf;
export const SHIFT_FOR_FIRST = 4;
export const MASK = 0x7f;
export const SHIFT = 7;
export class VarIntLE {
  static async read(input: Stream): Promise<[number, number]> {
    // 最初の1バイト
    const first = await input.readByte();
    asserts(first !== null);
    let value = first & MASK_FOR_FIRST;

    let shift = SHIFT_FOR_FIRST;
    let byte: number | null = first;
    while (byte >= 0x80) {
      byte = await input.readByte();
      asserts(byte !== null);
      value |= (byte & MASK) << shift;
      shift += SHIFT;
    }
    return [first, value];
  }

  static write(value: number) {
    const bytes: number[] = [];

    // 最初の1バイト
    const maskForFirst = MASK_FOR_FIRST;
    const shiftForFirst = 4;
    bytes.push(VarIntLE.maskByte(value, maskForFirst));
    value >>= shiftForFirst;

    // 最初/最後以外のバイト
    const mask = MASK;
    const shift = SHIFT;
    // most significant bitが1のときは次のバイトが存在する
    while (value > mask) {
      bytes.push(VarIntLE.maskByte(value, mask));
      value >>= shift;
    }
    // 最後のバイト
    bytes.push(value);
    return Uint8Array.from(bytes);
  }

  private static maskByte(value: number, mask: number) {
    return 0x80 | (value & mask);
  }
}
