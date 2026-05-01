import { constants } from "node:fs";
import { FileHandle } from "node:fs/promises";
import * as path from "node:path";
import * as FileService from "./services/FileService.ts";
import { Pathname, Rand } from "./types.ts";
import { asserts } from "./util/assert.ts";
import * as iter from "./util/iter.ts";

export function charsFromRange(start: string, end: string): string[] {
  asserts(
    start.length === 1,
    `Expected a single character, but got "${start}"`,
  );
  asserts(end.length === 1, `Expected a single character, but got "${end}"`);

  const startCharCode = start.charCodeAt(0);
  const endCharCode = end.charCodeAt(0) + 1;

  return Array.from(iter.range(startCharCode, endCharCode, 1)).map((code) =>
    String.fromCharCode(code),
  );
}

function sample(str: string) {
  const index = Math.floor(Math.random() * str.length);
  const char = str[index];
  asserts(char.length === 1);
  return char;
}

// const TEMP_CHARS = [
//   ...charsFromRange("A", "z"),
//   ...charsFromRange("0", "9"),
// ].join("");
const TEMP_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

interface Environment {
  rand?: Rand;
  fs?: FileService.FileService;
}

export class TempFile {
  #dirname: Pathname;
  #pathname: Pathname;
  #file?: FileHandle;
  #rand: Rand;
  #fs: FileService.FileService;
  constructor(dirname: Pathname, prefix: string, env: Environment = {}) {
    this.#dirname = dirname;
    this.#rand = env.rand ?? { sample };
    this.#fs = env.fs ?? FileService.defaultFs;
    this.#pathname = path.posix.join(dirname, this.generateTempName(prefix));
  }

  async write(data: Buffer): Promise<void> {
    if (this.#file === undefined) {
      await this.openFile();
    }
    this.assertOpened(this.#file);
    await this.#file.write(data);
  }
  async move(name: string): Promise<void> {
    this.assertOpened(this.#file);
    await this.#file.close();
    await this.#fs.rename(this.#pathname, path.posix.join(this.#dirname, name));
  }

  private async openFile(): Promise<void> {
    const flags = constants.O_RDWR | constants.O_CREAT | constants.O_EXCL;

    try {
      this.#file = await this.#fs.open(this.#pathname, flags);
    } catch (e) {
      const nodeErr = e as NodeJS.ErrnoException;
      if (nodeErr.code === "ENOENT") {
        await this.#fs.mkdir(this.#dirname);
        this.#file = await this.#fs.open(this.#pathname, flags);
        return;
      }
      console.error(e);
      throw e;
    }
  }

  private generateTempName(prefix: string) {
    let suffix = "";
    for (let i = 0; i < 6; i++) {
      suffix += this.#rand.sample(TEMP_CHARS);
    }
    return `${prefix}_${suffix}`;
  }

  private assertOpened(f: FileHandle | undefined): asserts f is FileHandle {
    asserts(f !== undefined);
  }
}
