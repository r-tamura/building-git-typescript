import { constants } from "fs";
import { FileHandle } from "fs/promises";
import * as path from "path";
import * as FileService from "./services/FileService";
import { Pathname, Rand } from "./types";
import { asserts } from "./util/assert";
import * as iter from "./util/iter";

function charsFromRange(start: string, end: string): string[] {
  asserts(start.length === 1);
  asserts(end.length === 1);

  const startCharCode = start.charCodeAt(0);
  const endCharCode = end.charCodeAt(0);

  return Array.from(iter.range(startCharCode, endCharCode)).map((code) =>
    String.fromCharCode(code),
  );
}

function sample(str: string) {
  const index = Math.floor(Math.random() * str.length);
  const char = str[index];
  asserts(char.length === 1);
  return char;
}

const TEMP_CHARS = [
  ...charsFromRange("A", "z"),
  ...charsFromRange("0", "9"),
].join("");
// "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

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
    this.#pathname = path.join(dirname, this.generateTempName(prefix));
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
    await this.#fs.rename(this.#pathname, path.join(this.#dirname, name));
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
