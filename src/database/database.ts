import { createHash } from "crypto";
import { constants } from "fs";
import { Z_BEST_SPEED } from "zlib";
import path = require("path");
import { FileService, defaultFs, Zlib, defaultZlib } from "../services";
import { GitObject, GitObjectParser, OID, CompleteGitObject } from "../types";
import * as assert from "assert";
import { Blob } from "./blob";
import { asserts, scanUntil } from "../util";
import { Tree } from "./tree";
import { Commit } from "./commit";
import { TreeDiff } from "./tree_diff";
import { PathFilter } from "../path_filter";

const TEMP_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

type Rand = {
  sample: (str: string) => string;
};

const sample = (str: string) => {
  const index = Math.floor(Math.random() * str.length);
  const char = str[index];
  assert.equal(char.length, 1);
  assert(str.includes(char));
  return char;
};

const defaultRand: Rand = {
  sample,
};

export type Environment = {
  fs?: FileService;
  rand?: Rand;
  zlib?: Zlib;
};

type Parsers = Record<"blob" | "tree" | "commit", GitObjectParser>;

const TYPES: Parsers = {
  blob: Blob,
  tree: Tree,
  commit: Commit,
} as const;

export class Database {
  #pathname: string;
  #objects: { [s: string]: CompleteGitObject } = {};

  // modules
  #fs: NonNullable<Environment["fs"]>;
  #rand: NonNullable<Environment["rand"]>;
  #zlib: NonNullable<Environment["zlib"]>;
  constructor(pathname: string, env: Environment = {}) {
    this.#pathname = pathname;
    this.#fs = env.fs ?? defaultFs;
    this.#rand = env.rand ?? defaultRand;
    this.#zlib = env.zlib ?? defaultZlib;
  }

  hashObject(obj: GitObject) {
    return this.hashContent(this.seliarizeObject(obj));
  }

  async load(oid: OID) {
    return (this.#objects[oid] = this.#objects[oid] ?? (await this.readObject(oid)));
  }

  async prefixMatch(oidPrefix: OID) {
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

  async readObject(oid: OID) {
    const objPath = this.objectPath(oid);
    const compressed = await this.#fs.readFile(objPath);
    const data = await this.#zlib.inflate(compressed);
    const object = parseObject(data);
    object.oid = oid;
    return object as CompleteGitObject;
  }

  shortOid(oid: OID) {
    return oid.slice(0, 7);
  }

  async store(obj: GitObject) {
    const content = this.seliarizeObject(obj);
    obj.oid = this.hashContent(content);

    await this.writeObject(obj.oid, content);
  }

  async treeDiff(a: OID | null, b: OID | null, filter = new PathFilter()) {
    const diff = new TreeDiff(this);
    await diff.compareOids(a, b, filter);
    return diff.changes;
  }

  private genTempName() {
    let suffix = "";
    for (let i = 0; i < 6; i++) {
      suffix += this.#rand.sample(TEMP_CHARS);
    }
    return `tmp_obj_${suffix}`;
  }

  async writeObject(oid: OID, content: Buffer) {
    const objPathname = this.objectPath(oid);

    if (await this.fileExists(objPathname)) {
      return;
    }

    const dirPath = path.dirname(objPathname);
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
    const compressed = await this.#zlib.deflate(content, {
      level: Z_BEST_SPEED,
    });
    await this.#fs.writeFile(fileHandle, compressed);
    this.#fs.rename(tempPath, objPathname);
    if (fileHandle) {
      await fileHandle.close();
    }
  }

  private hashContent(bytes: Buffer) {
    return createHash("sha1").update(bytes).digest("hex");
  }

  private objectPath(oid: OID) {
    return path.join(this.#pathname, oid.slice(0, 2), oid.slice(2));
  }

  private seliarizeObject(obj: GitObject) {
    const str = obj.toString();
    const contentStr = `${obj.type} ${str.length}\0${str}`;
    const bytes = Buffer.from(contentStr, "binary");
    return bytes;
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

function parseObject(obj: Buffer) {
  const [type, next] = scanUntil(" ", obj);
  const [size, endHeader] = scanUntil("\0", obj, next);
  asserts(type === "blob" || type === "tree" || type === "commit");

  const object = TYPES[type].parse(obj.slice(endHeader));
  return object;
}
