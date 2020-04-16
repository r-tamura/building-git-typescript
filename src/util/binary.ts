/**
 * 16進数を表現する文字列を4bit区切りのバイナリに変換します。
 * @param unpacked 未圧縮状態の16進数sha1文字列
 */
export function packHex(unpacked: string) {
  return Buffer.from(unpacked, "hex");
}

export function unpackHex(packed: Buffer | string) {
  const p = packed instanceof Buffer ? packed : Buffer.from(packed, "binary");
  return p.toString("hex");
}
