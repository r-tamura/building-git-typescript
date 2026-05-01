/**
 * 16進数を表現する文字列を4bit区切りのバイナリに変換します。
 * @param unpacked 未圧縮状態の16進数sha1文字列
 */
export function packHex(unpacked: string): Buffer {
  return Buffer.from(unpacked, "hex");
}

export function unpackHex(packed: Buffer | string): string {
  const p = Buffer.isBuffer(packed) ? packed : Buffer.from(packed, "binary");
  //                                                                                              ^?
  return p.toString("hex");
}

/**
 * バッファ内に指定された文字が見つかるまで読み込みます。読み込んだバッファとバッファ内のの検索する文字の次の位置を返します。
 *
 * @param char 検索する文字
 * @param buf バッファ
 * @param offset 検索を開始するオフセット
 */
export function scanUntil(
  char: string,
  buf: Buffer,
  offset = 0,
  encoding: BufferEncoding = "binary",
): [result: string, potision: number] {
  if (typeof char === "string" && char.length !== 1) {
    throw TypeError("scan character has to be 1 character");
  }
  let p = offset;
  const charCode = typeof char === "string" ? char.charCodeAt(0) : char;
  while (buf[p] && buf[p] !== charCode) {
    p++;
  }

  return [buf.slice(offset, p).toString(encoding), p + 1];
}

export const INT_SIZE = 4;
export const LNG_SIZE = 8;
export function packAsInt(...values: number[]): Buffer {
  const buf = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    buf.writeUInt32BE(values[i], INT_SIZE * i);
  }
  return buf;
}

export function unpackUsInt(buffer: Buffer): number[] {
  const numbers = [] as number[];
  for (let i = 0; i < Math.floor(buffer.length / INT_SIZE); i++) {
    numbers.push(buffer.readUInt32BE(INT_SIZE * i));
  }
  return numbers;
}

export function packAsLong(...values: number[]): Buffer {
  const buf = Buffer.alloc(values.length * INT_SIZE);
  for (let i = 0; i < values.length; i++) {
    buf.writeBigInt64BE(BigInt(values[i]), INT_SIZE * i);
  }
  return buf;
}

export function unpackUsLong(buffer: Buffer): number[] {
  const numbers = [] as number[];
  for (let i = 0; i < Math.floor(buffer.length / LNG_SIZE); i++) {
    const big = buffer.readBigInt64BE(LNG_SIZE * i);
    numbers.push(Number(big));
  }
  return numbers;
}
