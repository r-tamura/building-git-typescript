import * as path from "path";
import { constants } from "zlib";
import { Backend, Raw } from ".";
import { defaultFs, defaultZlib, FileService, Zlib } from "../services";
import { TempFile } from "../tempfile";
import { OID, Pathname, Rand } from "../types";
import { asserts } from "../util/assert";

export type GitObjectType = "blob" | "tree" | "commit";
export interface Environment {
  fs?: FileService;
  zlib?: Zlib;
  rand: Rand;
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

export class Loose implements Backend {
  #pathname: Pathname;
  #fs: FileService;
  #rand: Rand;
  #zlib: Zlib;
  constructor(pathname: Pathname, { fs, zlib, rand }: Environment) {
    this.#pathname = pathname;
    this.#fs = fs ?? defaultFs;
    this.#zlib = zlib ?? defaultZlib;
    this.#rand = rand;
  }

  async has(oid: OID): Promise<boolean> {
    return await this.fileExists(this.objectPath(oid));
  }

  async loadRaw(oid: OID): Promise<Raw> {
    const { type, size, body } = await this.readObjectHeader(oid);
    return new Raw(type, size, body);
  }

  async loadInfo(oid: OID): Promise<Raw> {
    const { type, size } = await this.readObjectHeader(oid, 128);
    return new Raw(type, size);
  }

  async prefixMatch(oidPrefix: OID): Promise<string[]> {
    const dirname = path.dirname(this.objectPath(oidPrefix));

    let filenames: string[];
    try {
      filenames = await this.#fs.readdir(dirname);
    } catch (e) {
      const nodeErr = e as NodeJS.ErrnoException;
      switch (nodeErr.code) {
        case "ENOENT":
          return [];
        default:
          throw e;
      }
    }

    return filenames
      .map((fn) => `${path.basename(dirname)}${fn}`)
      .filter((oid) => oid.startsWith(oidPrefix));
  }

  async writeObject(oid: OID, content: Buffer): Promise<void> {
    const objPathname = this.objectPath(oid);

    if (await this.fileExists(objPathname)) {
      return;
    }

    const file = new TempFile(path.dirname(objPathname), "tmp_obj", {
      fs: this.#fs,
      rand: this.#rand,
    });
    const compressed = await this.#zlib.deflate(content, {
      level: constants.Z_BEST_SPEED,
    });
    await file.write(compressed);
    await file.move(path.basename(objPathname));
  }

  private async readObjectHeader(oid: OID, readBytes?: number) {
    // TODO: 指定バイト数のみを読み込むことができるかを調査
    const objPath = this.objectPath(oid);
    const compressed = await this.#fs.readFile(objPath);
    const data = await this.#zlib.inflate(compressed);

    const [type, typeRead] = scanUntil(" ", data);
    const [size, sizeRead] = scanUntil("\0", data, typeRead);
    assertGitObjectType(type);

    return {
      type,
      size: Number.parseInt(size, 10),
      body: data.slice(sizeRead),
    };
  }

  private async fileExists(filepath: string) {
    try {
      await this.#fs.access(filepath);
    } catch (e) {
      const nodeErr = e as NodeJS.ErrnoException;
      if (nodeErr.code === "ENOENT") {
        return false;
      }
      throw e;
    }
    return true;
  }

  private objectPath(oid: OID) {
    return path.join(this.#pathname, oid.slice(0, 2), oid.slice(2));
  }
}

function assertGitObjectType(type: string): asserts type is GitObjectType {
  asserts(
    type === "blob" || type === "tree" || type === "commit",
    `'${type}'はGitオブジェクトでサポートされているタイプです`,
  );
}
