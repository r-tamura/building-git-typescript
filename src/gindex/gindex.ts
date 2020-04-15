/**
 * Note: index.jsはNodeJSでは特別な扱いをされるためgitのindexを扱う機能のファイル名はgindex.js (git index) とする
 */
import * as crypto from "crypto";
import { Stats, constants } from "fs";
import * as assert from "assert";
import { Pathname, OID } from "../types";
import { Lockfile, LockfileEnvironment } from "../lockfile";
import { asserts, packSha1, Invalid } from "../util";
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
  #digest: crypto.Hash | undefined;
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

  async loadForUpdate() {
    if (await this.#lockfile.holdForUpdate()) {
      await this.load();
      return true;
    }
    return false;
  }

  async writeUpdates() {
    if (!(await this.#lockfile.holdForUpdate())) {
      return false;
    }

    this.beginWrite();

    const header = this.buildHeader();
    await this.write(header.toString("binary"));

    for (const entry of this.eachEntry()) {
      await this.write(entry.toString());
    }
    await this.finishWrite();
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

  private async load() {
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
    }
  }

  private storeEntry(entry: Entry) {
    this.#keys.add(entry.key);
    this.#entries[entry.key] = entry;
  }

  private beginWrite() {
    this.#digest = crypto.createHash("sha1");
  }

  private async write(data: string) {
    asserts(
      typeof this.#digest !== "undefined",
      "beginWrite should be called first."
    );
    const dataBin = Buffer.from(data, "binary");
    await this.#lockfile.write(dataBin);
    this.#digest.update(dataBin);
  }

  private async finishWrite() {
    asserts(
      typeof this.#digest !== "undefined",
      "beginWrite should be called first."
    );
    const digest = this.#digest.digest("hex");
    await this.#lockfile.write(packSha1(digest));
    await this.#lockfile.commit();
  }

  private *eachEntry() {
    const sortedKeys = Array.from(this.#keys).sort();
    for (const key of sortedKeys) {
      yield this.#entries[key];
    }
  }

  private unpackHeader(header: Buffer) {
    assert.equal(header.length, Index.HEADER_SIZE);
    const signature = header.slice(0, 4).toString();
    const version = header.readUInt32BE(4);
    const count = header.readUInt32BE(8);
    return [signature, version, count] as const;
  }

  private unpackEntry(entry: Buffer) {}

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
