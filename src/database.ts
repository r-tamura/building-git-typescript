import { createHash } from "crypto";
import { createDeflate } from "zlib";
import { Blob, OID } from "./blob";
import { FileService, defaultFs, Zlib, defaultZlib } from "./services";
import path = require("path");
import { constants } from "fs";

const TEMP_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

type Rand = {
  sample: (str: string) => string
}

const sample = (str: string) => {
  const index = Math.floor(Math.random() * str.length)
  const char = str[index]
  console.assert(char.length === 1)
  console.assert(str.includes(char))
  return char
}

const defaultRand: Rand = {
  sample
}

type Environment = {
  fs?: FileService
  rand?: Rand
  zlib?: Zlib
}

export class Database {
  #pathname: string
  #fs: Required<Environment["fs"]>
  #rand: Required<Environment["rand"]>
  #zlib: Required<Environment["zlib"]>
  constructor(pathname: string, env: Environment = {}) {
    this.#pathname = pathname
    if (env) {
      this.#fs = env.fs ?? defaultFs
      this.#rand = env.rand ?? defaultRand
      this.#zlib = env.zlib ?? defaultZlib
    }
  }

  store(obj: Blob) {
    const str = obj.toString();
    const content = `${obj.type()} ${str.length}\0${str}`;

    obj.oid = createHash("sha1")
      .update(content)
      .digest("hex");

    this.writeObject(obj.oid, content);
  }

  async writeObject(oid: OID, content: string) {
    const [dirname, basename] = [oid.slice(0, 2), oid.slice(2)]
    const objectPath = path.join(this.#pathname, dirname, basename)
    const dirPath = path.join(this.#pathname, dirname)
    const tempPath = path.join(dirPath, this.genTempName())

    const flags = constants.O_RDWR | constants.O_CREAT | constants.O_EXCL

    let fileHandle = null // FileHandle型はエクスポートされていない
    let compressed: Buffer
    try {
      fileHandle = await this.#fs.open(tempPath, flags)
      compressed = await this.#zlib.deflate(content) as Buffer
      await this.#fs.writeFile(fileHandle, compressed)
    }
    catch(e) {
      const nodeErr = e as NodeJS.ErrnoException
      if (nodeErr.code === "ENOENT") {
        await this.#fs.mkdir(dirPath)
        fileHandle = await this.#fs.open(tempPath, flags)
      } else {
        throw e
      }
    }
    finally {
      if (fileHandle) {
        fileHandle.close()
      }
    }

    this.#fs.rename(tempPath, objectPath)
  }

  genTempName() {
    let suffix = ""
    for (let i = 0; i < 6; i++) {
      suffix += this.#rand.sample(TEMP_CHARS)
    }
    return `tmp_obj_${suffix}`
  }
}
