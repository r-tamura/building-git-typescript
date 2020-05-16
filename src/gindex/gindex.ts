/**
 * Note: index.jsはNodeJSでは特別な扱いをされるためgitのindexを扱う機能のファイル名はgindex.js (git index) とする
 */
import { Stats, constants } from "fs";
import * as assert from "assert";
import { Pathname, OID } from "../types";
import { Lockfile, LockfileEnvironment } from "../lockfile";
import { Invalid } from "../util";
import { Entry } from "./entry";
import { Checksum } from "./checksum";
import { FileService, defaultFs } from "../services";
import { IEntry } from "../entry";

type IndexEntryMap = { [s: string]: Entry };

export class Index {
  static readonly HEADER_SIZE = 12;
  static readonly SIGNATURE = "DIRC";
  static readonly VERSION = 2;

  #pathname: Pathname;
  #entries: IndexEntryMap;
  #keys: Set<Pathname>;
  #parents: Map<string, Set<string>>;
  #lockfile: Lockfile;
  #changed: boolean = false;
  #fs: FileService;
  constructor(pathname: Pathname, env: LockfileEnvironment = {}) {
    this.#pathname = pathname;
    this.#entries = {};
    this.#keys = new Set();
    this.#parents = new Map();
    this.clear();
    this.#lockfile = new Lockfile(pathname, env);
    this.#fs = env.fs ?? defaultFs;
  }

  add(pathname: Pathname, oid: OID, stat: Stats) {
    const entry = Entry.create(pathname, oid, stat);
    this.discardConflicts(entry);
    this.storeEntry(entry);
    this.#changed = true;
  }

  eachEntry() {
    const sortedKeys = Array.from(this.#keys).sort();
    const entries = sortedKeys.map((key) => this.#entries[key]);
    return entries;
  }

  entryForPath(pathname: Pathname) {
    return this.#entries[pathname];
  }

  async loadForUpdate() {
    await this.#lockfile.holdForUpdate();
    await this.load();
  }

  async load() {
    this.clear();

    const file = await this.openIndexFile();

    if (file === null) {
      return;
    }

    try {
      const reader = new Checksum(file);
      const count = await this.readHeader(reader);
      await this.readEntries(reader, count);
      await reader.verifyChecksum();
    } finally {
      file.close();
    }
  }

  async releaseLock() {
    return this.#lockfile.rollback();
  }

  tracked(pathname: Pathname) {
    // untracked検出の場合はディレクトリも検出する
    return this.trackedFile(pathname) || this.#parents.has(pathname);
  }

  trackedFile(pathname: Pathname) {
    return !!this.#entries[pathname];
  }

  updateEntryStat(entry: IEntry, stat: Stats) {
    entry.updateStat(stat);
    this.#changed = true;
  }

  async writeUpdates() {
    if (!this.#changed) {
      await this.#lockfile.rollback();
      return false;
    }

    const writer = new Checksum(this.#lockfile);

    const header = this.buildHeader();
    await writer.write(header);

    for (const entry of this.eachEntry()) {
      const packed = Buffer.from(entry.toString(), "binary");
      await writer.write(packed);
    }
    await writer.writeChecksum();
    await this.#lockfile.commit();
    return true;
  }

  private buildHeader() {
    const signature = Index.SIGNATURE;
    const version = Index.VERSION;
    const entryCount = Object.keys(this.#entries).length;
    const bufferSize = 4 + 4 + 4; // Signature + Version + Number of files
    const header = Buffer.alloc(bufferSize);

    header.write(signature, 0, 4);
    header.writeUInt32BE(version, 4);
    header.writeUInt32BE(entryCount, 8);

    return header;
  }

  private clear() {
    this.#entries = {};
    this.#keys = new Set();
    this.#changed = false;
  }

  private discardConflicts(entry: Entry) {
    for (const parent of entry.parentDirectories) {
      this.removeEntry(parent);
    }
    this.removeChildren(entry.name);
  }

  private initParentsItem(key: string) {
    this.#parents.set(key, new Set());
  }

  private async openIndexFile() {
    return this.#fs
      .open(this.#pathname, constants.O_RDONLY)
      .catch((e: NodeJS.ErrnoException) => {
        if (e.code === "ENOENT") {
          return null;
        }
        throw e;
      });
  }

  private async readHeader(reader: Checksum) {
    const data = await reader.read(Index.HEADER_SIZE);
    const [signature, version, count] = this.unpackHeader(data);

    if (signature !== Index.SIGNATURE) {
      throw new Invalid(
        `Signature: expected '${Index.SIGNATURE}' but found '${signature}'`
      );
    }

    if (version !== Index.VERSION) {
      throw new Invalid(
        `Version: expected '${Index.VERSION} but found '${version}'`
      );
    }

    return count;
  }

  private async readEntries(reader: Checksum, count: number) {
    for (const i of this.times(count)) {
      // ファイルメタ情報の読み込み
      let entry = await reader.read(Entry.MIN_SIZE);

      // ファイル名の読み込み
      // ブロックの最終バイトが'null文字'の場合、データの終端を意味する
      while (!this.isNullChar(entry.slice(-1))) {
        const block = await reader.read(Entry.BLOCK_SIZE);
        entry = Buffer.concat([entry, block]);
      }
      this.storeEntry(Entry.parse(entry));
    }
  }

  private removeChildren(pathname: Pathname) {
    if (!this.#parents.has(pathname)) {
      return;
    }
    const children = this.#parents.get(pathname)?.values() ?? [];
    for (const child of children) {
      this.removeEntry(child);
    }
  }

  private removeEntry(pathname: Pathname) {
    const entry = this.#entries[pathname];
    if (!entry) {
      return;
    }

    this.#keys.delete(entry.key);
    delete this.#entries[entry.key];

    for (const dirname of entry.parentDirectories) {
      const children = this.#parents.get(dirname);
      children?.delete(entry.name);
      if (children?.size === 0) {
        this.#parents.delete(dirname);
      }
    }
  }

  private storeEntry(entry: Entry) {
    this.#keys.add(entry.key);
    this.#entries[entry.key] = entry;
    for (const dirname of entry.parentDirectories) {
      if (!this.#parents.has(dirname)) {
        this.initParentsItem(dirname);
      }
      const set = this.#parents.get(dirname);
      set?.add(entry.name);
    }
  }

  private unpackHeader(header: Buffer) {
    assert.equal(header.length, Index.HEADER_SIZE);
    const signature = header.slice(0, 4).toString();
    const version = header.readUInt32BE(4);
    const count = header.readUInt32BE(8);
    return [signature, version, count] as const;
  }

  private *times(count: number) {
    for (let i = 0; i < count; i++) {
      yield i;
    }
  }

  private isNullChar(char: Buffer) {
    assert.equal(char.length, 1);
    return char.toString() === "\0";
  }
}
