import * as stream from "stream";
import * as FileService from "../services";
import { asserts } from "../util";
import * as iter from "../util/iter";

/**
 * NodeJS.ReadableとRubyのReadable、Building git内で実装したStreamのインタフェースが合わないため、
 * それらを統一するためのインタフェース
 */
export interface Readable {
  read(size: number): Promise<Buffer | null>;
  readByte(): Promise<number | null>;
  readableEnded: boolean;
}

export function fromBuffer(inputBuffer: Buffer): Readable {
  const input = stream.Readable.from(inputBuffer);
  let buffer = Buffer.alloc(0);
  let readBytes = 0;

  function splitBuffer(buffer: Buffer, point: number) {
    const first = buffer.slice(0, point);
    const second = buffer.slice(point);
    return [first, second];
  }

  function consumeBuffer(size: number): Buffer {
    const [needed, rest] = splitBuffer(buffer, size);
    buffer = rest;
    return needed;
  }

  async function read(size: number): Promise<Buffer | null> {
    const fromBuffer = consumeBuffer(size);

    if (fromBuffer.byteLength === size) {
      return fromBuffer;
    }
    const neededSize = size - fromBuffer.byteLength;
    const fromStream = await FileService.readChunk(input, size);
    const [needed, rest] = splitBuffer(fromStream, neededSize);
    if (rest.byteLength > 0) {
      buffer = Buffer.concat([buffer, rest]);
    }
    readBytes += fromStream.byteLength;
    return Promise.resolve(Buffer.concat([fromBuffer, needed]));
  }

  async function readByte(): Promise<number | null> {
    return (await read(1))?.[0] ?? null;
  }

  function isStreamEnded() {
    return readBytes >= inputBuffer.byteLength;
  }

  function isBufferEmpty() {
    return buffer.byteLength === 0;
  }

  return {
    read,
    readByte,
    get readableEnded() {
      return isStreamEnded() && isBufferEmpty();
    },
  };
}

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
  static OBJECT_TYPE_MASK = 0x7; // object type: 3bit
  static MASK_FOR_FIRST = 0xf;
  static SHIFT_FOR_FIRST = 4;
  static MASK = 0x7f;
  static SHIFT = 7;

  static async read(
    input: Readable,
    shift: number,
  ): Promise<[first: number, value: number]> {
    // 最初の1バイト
    const first = await input.readByte();
    asserts(first !== null);
    let value = first & (2 ** shift - 1);

    let byte: number | null = first;
    while (byte >= 0x80) {
      byte = await input.readByte();
      asserts(byte !== null);
      value |= (byte & VarIntLE.MASK) << shift;
      shift += VarIntLE.SHIFT;
    }
    return [first, value];
  }

  static write(value: number, shift: number): Buffer {
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

  static async read(input: Readable, header: number): Promise<bigint> {
    let value = BigInt(0);
    for (const i of iter.range(0, 7)) {
      if ((header & (1 << i)) === 0) {
        continue;
      }
      const byte = await input.readByte();
      asserts(typeof byte !== null);
      value |= BigInt(byte) << BigInt(8 * i);
    }
    return value;
  }
}
