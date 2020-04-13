import { createHash } from "crypto";
import { constants } from "fs";
import { FileService, defaultFs, Zlib, defaultZlib } from "../services";
import path = require("path");
import { GitObject, OID } from "../types";
import { Z_BEST_SPEED } from "zlib";

const TEMP_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

type Rand = {
  sample: (str: string) => string;
};

const sample = (str: string) => {
  const index = Math.floor(Math.random() * str.length);
  const char = str[index];
  console.assert(char.length === 1);
  console.assert(str.includes(char));
  return char;
};

const defaultRand: Rand = {
  sample,
};

type Environment = {
  fs?: FileService;
  rand?: Rand;
  zlib?: Zlib;
};

export class Database {
  #pathname: string;
  #fs: NonNullable<Environment["fs"]>;
  #rand: NonNullable<Environment["rand"]>;
  #zlib: NonNullable<Environment["zlib"]>;
  constructor(pathname: string, env: Environment = {}) {
    this.#pathname = pathname;
    this.#fs = env.fs ?? defaultFs;
    this.#rand = env.rand ?? defaultRand;
    this.#zlib = env.zlib ?? defaultZlib;
  }

  async store(obj: GitObject) {
    const str = obj.toString();
    const contentStr = `${obj.type()} ${str.length}\0${str}`;
    const content = Buffer.from(contentStr, "binary");

    obj.oid = createHash("sha1").update(content).digest("hex");

    this.writeObject(obj.oid, content);
  }

  async writeObject(oid: OID, content: Buffer) {
    const [dirname, basename] = [oid.slice(0, 2), oid.slice(2)];
    const objectPath = path.join(this.#pathname, dirname, basename);

    if (await this.fileExists(objectPath)) {
      return;
    }

    const dirPath = path.join(this.#pathname, dirname);
    const tempPath = path.join(dirPath, this.genTempName());

    const flags = constants.O_RDWR | constants.O_CREAT | constants.O_EXCL;

    let fileHandle = null; // FileHandle型はエクスポートされていない
    try {
      fileHandle = await this.#fs.open(tempPath, flags);
    } catch (e) {
      const nodeErr = e as NodeJS.ErrnoException;
      if (nodeErr.code === "ENOENT") {
        await this.#fs.mkdir(dirPath);
        fileHandle = await this.#fs.open(tempPath, flags);
      } else {
        throw e;
      }
    }
    const compressed = (await this.#zlib.deflate(content, {
      level: Z_BEST_SPEED,
    })) as Buffer;
    await this.#fs.writeFile(fileHandle, compressed);
    this.#fs.rename(tempPath, objectPath);
    if (fileHandle) {
      await fileHandle.close();
    }
  }

  private genTempName() {
    let suffix = "";
    for (let i = 0; i < 6; i++) {
      suffix += this.#rand.sample(TEMP_CHARS);
    }
    return `tmp_obj_${suffix}`;
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
}
