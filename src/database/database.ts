import * as assert from "assert";
import { createHash } from "crypto";
import { constants } from "fs";
import { constants as zlibConstants } from "zlib";
import { PathFilter } from "../path_filter";
import { defaultFs, defaultZlib, FileService, Zlib } from "../services";
import {
  CompleteGitObject,
  CompleteTree,
  Dict,
  GitObjectParser,
  Nullable,
  OID,
  Pathname,
} from "../types";
import { asserts, scanUntil } from "../util";
import { eachFile } from "../util/fs";
import { Blob } from "./blob";
import { Commit } from "./commit";
import { Entry } from "./entry";
import { Tree } from "./tree";
import { TreeDiff } from "./tree_diff";
import path = require("path");

const TEMP_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

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

type GitObjectType = "blob" | "tree" | "commit";
type Parsers = Record<GitObjectType, GitObjectParser>;

interface Seriarizable {
  type: GitObjectType;
  toString(): string;
  oid: Nullable<OID>;
}

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

  hashObject(obj: Seriarizable) {
    return this.hashContent(this.seliarizeObject(obj));
  }

  async load(oid: OID) {
    return (this.#objects[oid] ??= await this.readObject(oid));
  }

  async loadRaw(oid: OID) {
    const { type, size, body } = await this.readObjectHeader(oid);
    return new Raw(type, size, body);
  }

  async loadInfo(oid: OID): Promise<Raw> {
    const { type, size } = await this.readObjectHeader(oid, 128);
    return new Raw(type, size);
  }

  /**
   * あるコミット内の指定されたファイルパスのエントリを取得します。
   * ファイルパスが指定されない場合はコミットのTreeエントリを返します。
   * コミット内にファイルパスが存在しない場合は、nullを返します
   *
   * @param oid - コミットID
   * @param pathname - ファイルパス
   */
  async loadTreeEntry(oid: OID, pathname: Nullable<Pathname> = null) {
    const commit = await this.load(oid);
    asserts(
      commit.type === "commit",
      `commitのOIDである必要があります: '${commit.type}'`,
    );
    const root = new Entry(commit.tree, Tree.TREE_MODE);

    if (!pathname) {
      return root;
    }

    let item: Entry | null = root;
    for (const name of eachFile(pathname)) {
      // データベースからロードされたオブジェクトはOIDを持つことが保証されている
      // データベースからロードされたTreeのentriesはDict<Database.Entry>。Tree#parse参照
      item = item
        ? (((await this.load(item.oid)) as CompleteTree)
            .entries as Dict<Entry>)[name]
        : null;
    }

    return item;
  }

  /**
   * コミットIDに含まれる全てのエントリを { ファイルパス => エントリ } としたDict形式で取得します。
   * ファイルの場合はそのファイルの1エントリのみのDict、ディレクトリの場合はディレクトリ下の全てのファイルのDictを返します。
   * パスが指定された場合、そのパス配下のファイルのみを取得します。
   * OIDが指定されない場合は空のDictを返します
   * @param oid
   * @param pathname
   */
  async loadTreeList(
    oid: Nullable<OID> = null,
    pathname: Nullable<Pathname> = null,
  ) {
    if (!oid) {
      return {};
    }
    const entry = await this.loadTreeEntry(oid, pathname);
    const list: Dict<Entry> = {};
    await this.buildList(list, entry, pathname ?? "");
    return list;
  }

  private async buildList(
    list: Dict<Entry>,
    entry: Nullable<Entry>,
    prefix: Pathname,
  ) {
    if (!entry) {
      return;
    }
    // エントリがBlob(ファイル)の場合
    if (!entry.tree()) {
      list[prefix] = entry;
      return;
    }

    // エントリがTree(ディレクトリの場合
    const tree = (await this.load(entry.oid)) as CompleteTree;
    for (const [name, item] of Object.entries(tree.entries)) {
      // loadされたTreeはDict<Entry>
      const childEntry = item as Entry;
      await this.buildList(list, childEntry, path.join(prefix, name));
    }
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

  async readObject(oid: OID): Promise<CompleteGitObject> {
    const { type, body } = await this.readObjectHeader(oid);
    const object = TYPES[type].parse(body);
    object.oid = oid;
    return object as CompleteGitObject;
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

  shortOid(oid: OID) {
    return oid.slice(0, 7);
  }

  async has(oid: OID) {
    return await this.fileExists(this.objectPath(oid));
  }

  async store(obj: Seriarizable) {
    const content = this.seliarizeObject(obj);
    obj.oid = this.hashContent(content);

    await this.writeObject(obj.oid, content);
  }

  async treeDiff(a: OID | null, b: OID | null, filter = new PathFilter()) {
    const diff = new TreeDiff(this);
    await diff.compareOids(a, b, filter);
    return diff.changes;
  }

  treeEntry(oid: OID) {
    return new Entry(oid, Tree.TREE_MODE);
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
      level: zlibConstants.Z_BEST_SPEED,
    });
    await this.#fs.writeFile(fileHandle, compressed);
    await this.#fs.rename(tempPath, objPathname);
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

  private seliarizeObject(obj: Seriarizable) {
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

export class Raw {
  constructor(
    public type: GitObjectType,
    public size: number,
    public data: Buffer = Buffer.alloc(0),
  ) {}
}

function assertGitObjectType(type: string): asserts type is GitObjectType {
  asserts(
    type === "blob" || type === "tree" || type === "commit",
    `'${type}'はGitオブジェクトでサポートされているタイプです`,
  );
}
