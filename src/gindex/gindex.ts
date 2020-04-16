/**
 * Note: index.jsはNodeJSでは特別な扱いをされるためgitのindexを扱う機能のファイル名はgindex.js (git index) とする
 */
import * as crypto from "crypto";
import { Stats, constants } from "fs";
import * as assert from "assert";
import { Pathname, OID } from "../types";
import { Lockfile, LockfileEnvironment } from "../lockfile";
import { asserts, packHex, Invalid } from "../util";
import { Entry } from "./entry";
import { Checksum } from "./checksum";
import { FileService, defaultFs } from "../services";

type IndexEntryMap = { [s: string]: Entry };

export class Index {
  static HEADER_SIZE = 12;
  static SIGNATURE = "DIRC";
  static VERSION = 2;

  #pathname: Pathname;
  #entries: IndexEntryMap;
  #keys: Set<Pathname>;
  #lockfile: Lockfile;
  #changed: boolean = false;
  #fs: FileService;
  constructor(pathname: Pathname, env: LockfileEnvironment = {}) {
    this.#pathname = pathname;
    this.#entries = {};
    this.#keys = new Set();
    this.clear();
    this.#lockfile = new Lockfile(pathname, env);
    this.#fs = env.fs ?? defaultFs;
  }

  add(pathname: Pathname, oid: OID, stat: Stats) {
    const entry = Entry.create(pathname, oid, stat);
    this.storeEntry(entry);
    this.#changed = true;
  }

  eachEntry() {
    const sortedKeys = Array.from(this.#keys).sort();
    const entries = sortedKeys.map((key) => this.#entries[key]);
    return entries;
  }

  async loadForUpdate() {
    if (await this.#lockfile.holdForUpdate()) {
      await this.load();
      return true;
    }
    return false;
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

  private storeEntry(entry: Entry) {
    this.#keys.add(entry.key);
    this.#entries[entry.key] = entry;
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
