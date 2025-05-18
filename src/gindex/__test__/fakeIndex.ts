// 2 ファイル

import { FileReadOptions, FileReadResult } from "fs/promises";

// 2 files
export const fakeFiles = {
  "b.txt": {
    name: "b.txt",
    stat: {
      dev: 16777221,
      mode: 33188,
      uid: 501,
      gid: 20,
      ino: 8641985231 & 0xffffffff, // 32bit切り取り
      size: 0,
      atimeMs: 1586584079668.6257,
      mtimeMs: 1586584079668.6257,
      ctimeMs: 1586584079668.6257,
    },
  },
  "world.txt": {
    name: "world.txt",
    stat: {
      dev: 16777221,
      mode: 33188,
      uid: 501,
      gid: 20,
      ino: 8641985877 & 0xffffffff,
      size: 6,
      atimeMs: 1586761385399.8,
      mtimeMs: 1586585255554.8743,
      ctimeMs: 1586585255554.8743,
    },
  },
};

const dirc = () => Buffer.from("DIRC");
const version = (v: number) => Buffer.from([0, 0, 0, v]);
const entryCount = (count: number) => Buffer.from([0, 0, 0, count]);
const header = (entryCnt: number) =>
  Buffer.concat([dirc(), version(2), entryCount(entryCnt)], 12);

/*
+-------------------+
|  Header (12byte)  |
+-------------------+
| "DIRC"  | 4byte   |  マジックナンバー
| Version | 4byte   |  バージョン番号 (例: 0x00000002)
| Entries | 4byte   |  エントリ数
+-------------------+

+-------------------------------------------------------------+
|  Entry (1つ分, 固定長部分: 62byte + 可変長ファイル名 + パディング) |
+-------------------------------------------------------------+
| ctime(sec)      | 4byte | ファイルのctime(秒)
| ctime(nsec)     | 4byte | ファイルのctime(ナノ秒)
| mtime(sec)      | 4byte | ファイルのmtime(秒)
| mtime(nsec)     | 4byte | ファイルのmtime(ナノ秒)
| dev             | 4byte | デバイス番号
| ino             | 4byte | inode番号
| mode            | 4byte | モード
| uid             | 4byte | ユーザーID
| gid             | 4byte | グループID
| size            | 4byte | ファイルサイズ
| SHA-1           |20byte | オブジェクトID
| flags           | 2byte | フラグ（ファイル名長など）
| name            |N byte | ファイル名（N=flagsの下位12bit）
| padding         |M byte | 8バイト境界まで0埋め
+-------------------------------------------------------------+
*/
// prettier-ignore
export const fakeIndex = Buffer.of(
  // HEADER
  0x44, 0x49, 0x52, 0x43, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02,

  // Entry 1
  0x68, 0x28, 0x1C, 0xC6, 0x33, 0x2D, 0xAE, 0xDC, 0x68, 0x28, 0x1C, 0xC6, 0x33, 0x2D, 0xAE, 0xDC,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x81, 0xA4, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xE6, 0x9D, 0xE2, 0x9B, 0xB2, 0xD1, 0xD6, 0x43,
  0x4B, 0x8B, 0x29, 0xAE, 0x77, 0x5A, 0xD8, 0xC2, 0xE4, 0x8C, 0x53, 0x91, 0x00, 0x05, 0x62, 0x2E,
  0x74, 0x78, 0x74, 0x00, 0x00, 0x00, 0x00, 0x00,

  // Entry 2
  0x68, 0x28, 0x1C, 0xCE, 0x0C, 0x9F, 0x19, 0xB8, 0x68, 0x28, 0x1C, 0xCE, 0x0C, 0x9F, 0x19, 0xB8,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x81, 0xA4, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xE6, 0x9D, 0xE2, 0x9B, 0xB2, 0xD1, 0xD6, 0x43,
  0x4B, 0x8B, 0x29, 0xAE, 0x77, 0x5A, 0xD8, 0xC2, 0xE4, 0x8C, 0x53, 0x91, 0x00, 0x09, 0x77, 0x6F,
  0x72, 0x6C, 0x64, 0x2E, 0x74, 0x78, 0x74, 0x00,

  // Checksum
  0xFB, 0x46, 0x03, 0xF5, 0x9D, 0xA1, 0x72, 0xC4, 0xAB, 0x9F,
  0xB6, 0x4D, 0x93, 0xE1, 0x4C, 0x32, 0xA6, 0xAA, 0x8B, 0x72
);

export function fakeFileHandleRead(
  data: Buffer = fakeIndex,
): (
  options?:
    | FileReadOptions<NodeJS.ArrayBufferView<ArrayBufferLike>>
    | undefined,
) => Promise<FileReadResult<NodeJS.ArrayBufferView<ArrayBufferLike>>> {
  function* fakeRead(
    data: Buffer,
  ): Generator<
    Promise<{ bytesRead: number; buffer: Buffer }>,
    Promise<null>,
    number
  > {
    const length = data.length;
    let point = 0;
    let size = yield Promise.resolve({ bytesRead: 0, buffer: Buffer.alloc(0) });
    while (point + size < length) {
      const slice = data.slice(point, point + size);
      point += size;
      size = yield Promise.resolve({ bytesRead: size, buffer: slice });
      size = size ?? 0;
    }
    const slice = data.slice(point);
    yield Promise.resolve({ bytesRead: length - point, buffer: slice });
    return Promise.resolve(null);
  }
  const gen = fakeRead(data);
  gen.next();
  return async (options) => {
    if (options === undefined) {
      throw new Error("options is undefined");
    }
    if (options.buffer == null) {
      throw new Error("buffer is null");
    }
    if (options.length == null) {
      throw new Error("length is null");
    }
    const { buffer, length } = options;
    if (length === undefined) {
      throw new Error("length is undefined");
    }
    const empty = { bytesRead: 0, buffer };
    if (length < 0) {
      console.warn("length < 0");
      return empty;
    }
    const next = gen.next(length);
    if (next.done) {
      console.warn("done");
      return empty;
    }
    const { bytesRead, buffer: buf } = await next.value;
    const uint8Buffer = new Uint8Array(buffer.byteLength);
    buf.copy(uint8Buffer, 0, 0, buf.length);
    return { bytesRead, buffer: uint8Buffer };
  };
}
