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
export class VarIntLE {
  static write(value: number) {
    const bytes: number[] = [];

    // 最初の1バイト
    const maskForFirst = 0xf;
    const shiftForFirst = 4;
    bytes.push(VarIntLE.maskByte(value, maskForFirst));
    value >>= shiftForFirst;

    // 最初/最後以外のバイト
    const mask = 0x7f;
    const shift = 7;
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
