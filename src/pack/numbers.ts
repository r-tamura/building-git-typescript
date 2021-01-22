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
import * as iter from "../util/iter";
import { Stream } from "./stream";

export class VarIntLE {
  static OBJECT_TYPE_MASK = 0x7; // object type: 3bit
  static MASK_FOR_FIRST = 0xf;
  static SHIFT_FOR_FIRST = 4;
  static MASK = 0x7f;
  static SHIFT = 7;

  static async read(input: Stream, shift: number): Promise<[number, number]> {
    // 最初の1バイト
    const first = await input.readByte();
    asserts(first !== null);
    let value = first & (2 ** shift - 1);

    // let shift = SHIFT_FOR_FIRST;
    let byte: number | null = first;
    while (byte >= 0x80) {
      byte = await input.readByte();
      asserts(byte !== null);
      value |= (byte & VarIntLE.MASK) << shift;
      shift += VarIntLE.SHIFT;
    }
    return [first, value];
  }

  static write(value: number, shift: number) {
    const bytes: number[] = [];
    let mask = 2 ** shift - 1;

    // most significant bitが1のときは次のバイトが存在する
    while (value > mask) {
      bytes.push(VarIntLE.maskByte(value, mask));
      value >>= shift;
      mask = VarIntLE.MASK;
      shift = VarIntLE.SHIFT;
    }
    // 最後のバイト
    bytes.push(value);
    return Buffer.from(bytes);
  }

  private static maskByte(value: number, mask: number) {
    return 0x80 | (value & mask);
  }
}

export class PackedInt56LE {
  static write(value: number): Buffer {
    // Note: JavaScriptのbitwiseオペレータは32bitの2の補数intのみ扱うため(7バイト/56bitの値はbitwise操作では扱えない)
    // => BigIntを利用する
    const valueBigInt = BigInt(value);
    const bytes = [0];

    for (const i of iter.range(0, 7)) {
      // Number -> BigInt -> Number
      const byte = Number((valueBigInt >> BigInt(8 * i)) & BigInt(0xff));
      if (byte === 0) {
        continue;
      }

      bytes[0] |= 1 << i;
      bytes.push(byte);
    }

    return Buffer.of(...bytes);
  }

  static read(input: Buffer, header: number): number {
    let value = 0;
    let offset = 0;
    for (const i of iter.range(0, 7)) {
      if ((header & (1 << i)) === 0) {
        continue;
      }
      value |= input[offset] << (8 * i);
      offset += 1;
    }
    return value;
  }
}
