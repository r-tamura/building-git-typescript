/**
 * 4bitごとに圧縮したSHA1バイナリを返します。
 * @param unpacked 未圧縮状態の16進数sha1文字列
 */
export function packSha1(unpacked: string) {
  return Buffer.from(unpacked, "hex");
}

export function unpackSha1(packed: Buffer | string) {
  const p = packed instanceof Buffer ? packed : Buffer.from(packed, "binary");
  return p.toString("hex");
}
