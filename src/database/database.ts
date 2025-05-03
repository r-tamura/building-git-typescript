import * as assert from "assert";
import { createHash } from "crypto";
import { PathFilter } from "../path_filter";
import { defaultFs, defaultZlib, FileService, Zlib } from "../services";
import {
  CompleteGitObject,
  CompleteTree,
  Dict,
  GitObjectParser,
  Nullable,
  OID
} from "../types";
import { asserts } from "../util";
import { POSIX_PATH_ZERO, posixJoin, PosixPath, toPathComponentsPosix } from "../util/fs";
import { Backends } from "./backends";
import { Blob } from "./blob";
import { Commit } from "./commit";
import { Entry } from "./entry";
import { GitObjectType } from "./loose";
import { Tree } from "./tree";
import { TreeDiff } from "./tree_diff";
import path = require("path");

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

export interface Environment {
  fs?: FileService;
  rand?: Rand;
  zlib?: Zlib;
}

type Parsers = Record<GitObjectType, GitObjectParser>;

interface Seriarizable {
  type: GitObjectType;
  toString(): string;
  oid: Nullable<OID>;
}

export interface Backend {
  has(oid: OID): Promise<boolean>;
  loadRaw(oid: OID): Promise<GitRecord>;
  loadInfo(oid: OID): Promise<Raw>;
  prefixMatch(oid: OID): Promise<string[]>;
  writeObject(oid: OID, content: Buffer): Promise<void>;
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
  #backend!: Backend;
  constructor(pathname: string, env: Environment = {}) {
    this.#pathname = pathname;
    this.#fs = env.fs ?? defaultFs;
    this.#rand = env.rand ?? defaultRand;
    this.#zlib = env.zlib ?? defaultZlib;
    this.#backend = new Backends(pathname, {
      rand: this.#rand,
      fs: this.#fs,
      zlib: this.#zlib,
    });
  }

  hashObject(obj: Seriarizable) {
    return this.hashContent(this.seliarizeObject(obj));
  }

  async load(oid: OID) {
    return (this.#objects[oid] ??= await this.readObject(oid));
  }

  /**
   * あるコミット内の指定されたファイルパスのエントリを取得します。
   * ファイルパスが指定されない場合はコミットのTreeエントリを返します。
   * コミット内にファイルパスが存在しない場合は、nullを返します
   *
   * @param oid - コミットID
   * @param pathname - ファイルパス
   */
  async loadTreeEntry(oid: OID, pathname: PosixPath | null = null) {
    const commit = await this.load(oid);
    asserts(
      commit.type === "commit",
      `commitのOIDである必要があります: '${commit.type}'`,
    );
    const root = new Entry(commit.tree, Tree.TREE_MODE);

    if (pathname === null) {
      return root;
    }

    let item: Entry | null = root;
    for (const name of toPathComponentsPosix(pathname)) {
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
    oid: OID | null = null,
    pathname: PosixPath | null = null,
  ) {
    if (!oid) {
      return {};
    }
    const entry = await this.loadTreeEntry(oid, pathname);
    const list: Dict<Entry> = {};
    await this.buildList(list, entry, pathname ?? POSIX_PATH_ZERO);
    return list;
  }

  private async buildList(
    list: Dict<Entry>,
    entry: Nullable<Entry>,
    prefix: PosixPath,
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
      await this.buildList(list, childEntry, posixJoin(prefix, name));
    }
  }

  async readObject(oid: OID): Promise<CompleteGitObject> {
    const raw = await this.#backend.loadRaw(oid);
    const object = TYPES[raw.type].parse(raw.data);
    object.oid = oid;
    return object as CompleteGitObject;
  }

  shortOid(oid: OID) {
    return oid.slice(0, 7);
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

  private hashContent(bytes: Buffer) {
    return createHash("sha1").update(bytes).digest("hex");
  }

  packPath(): string {
    return path.join(this.#pathname, "pack");
  }

  async has(oid: OID): Promise<boolean> {
    return await this.#backend.has(oid);
  }

  async loadRaw(oid: OID): Promise<GitRecord> {
    return await this.#backend.loadRaw(oid);
  }

  async loadInfo(oid: OID): Promise<Raw> {
    return await this.#backend.loadInfo(oid);
  }

  async writeObject(oid: OID, content: Buffer): Promise<void> {
    await this.#backend.writeObject(oid, content);
  }

  async prefixMatch(oidPrefix: OID) {
    return await this.#backend.prefixMatch(oidPrefix);
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
}

export interface GitRecord {
  type: GitObjectType;
  data: Buffer;
}
export class Raw implements GitRecord {
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
