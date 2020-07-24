/**
 * Note: index.jsはNodeJSでは特別な扱いをされるためgitのindexを扱う機能のファイル名はgindex.js (git index) とする
 */
import { Stats, constants } from "fs";
import * as assert from "assert";
import { Pathname, OID } from "../types";
import { Lockfile, LockfileEnvironment } from "../lockfile";
import { Invalid, times, ObjectKeyHash, ObjectSet, some } from "../util";
import { Entry, Key, Stage, STAGES, LEFT, RIGHT, BASE } from "./entry";
import { Checksum } from "./checksum";
import { FileService, defaultFs } from "../services";
import * as Database from "../database";

type IndexEntryMap = ObjectKeyHash<Key, Entry>;

export class Index {
  static readonly HEADER_SIZE = 12;
  static readonly SIGNATURE = "DIRC";
  static readonly VERSION = 2;

  #pathname: Pathname;
  #entries: IndexEntryMap = new ObjectKeyHash(serialize, deserialize);
  #keys: ObjectSet<Key> = new ObjectSet(serialize, deserialize);
  #parents: Map<string, Set<string>> = new Map();
  #lockfile: Lockfile;
  #changed = false;
  #fs: FileService;
  constructor(pathname: Pathname, env: LockfileEnvironment = {}) {
    this.#pathname = pathname;
    this.clear();
    this.#lockfile = new Lockfile(pathname, env);
    this.#fs = env.fs ?? defaultFs;
  }

  add(pathname: Pathname, oid: OID, stat: Stats) {
    ([BASE, LEFT, RIGHT] as const).forEach((stage) => this.removeEntryWithStage(pathname, stage));
    const entry = Entry.create(pathname, oid, stat);
    this.discardConflicts(entry);
    this.storeEntry(entry);
    this.#changed = true;
  }

  addFromDb(pathname: Pathname, item: Database.Entry) {
    this.storeEntry(Entry.createFromDb(pathname, item, 0));
    this.#changed = true;
  }

  /**
   * 指定されたパスのステージ0(非コンフリクト時)のエントリを削除し、コンフリクト時のエントリ(ステージ1/2/3)を追加します。
   * @param pathname オブジェクトのファイルパス
   * @param items コンフリクト時の各ステージエントリ
   */
  addConflictSet(
    pathname: Pathname,
    items: readonly [Database.Entry | null, Database.Entry | null, Database.Entry | null]
  ) {
    this.removeEntryWithStage(pathname, 0);

    items.forEach((item, n) => {
      if (!item) {
        return;
      }
      // itemsは3要素のタプルなので、0 <= n < 3
      const indexEntry = Entry.createFromDb(pathname, item, (n + 1) as Stage);
      this.storeEntry(indexEntry);
    });
    this.#changed = true;
  }

  conflict() {
    return some(this.#entries, ([_key, entry]) => entry.stage > 0);
  }

  eachEntry() {
    const sortedKeys = Array.from(this.#keys).sort();
    const entries = sortedKeys.map((key) => this.#entries.get(key)!);
    return entries;
  }

  /**
   * 指定されたディレクトリパスの子要素を配列で返します
   * @param pathname 親ディレクトリパス
   */
  childPaths(pathname: Pathname) {
    const childs = this.#parents.get(pathname);
    return childs ? Array.from(childs) : [];
  }

  entryForPath(pathname: Pathname, stage: Stage = 0): Entry | null {
    return this.#entries.get([pathname, stage]) ?? null;
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
      await file.close();
    }
  }

  async releaseLock() {
    return this.#lockfile.rollback();
  }

  async remove(pathname: Pathname) {
    this.removeEntry(pathname);
    this.removeChildren(pathname);
    this.#changed = true;
  }

  tracked(pathname: Pathname) {
    // untracked検出の場合はディレクトリも検出する
    return this.trackedFile(pathname) || this.#parents.has(pathname);
  }

  trackedFile(pathname: Pathname) {
    return STAGES.some((stage) => this.#entries.has([pathname, stage]));
  }

  trackedDirectory(pathname: Pathname) {
    return this.#parents.has(pathname);
  }

  updateEntryStat(entry: Database.WriteEntry, stat: Stats) {
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
    const entryCount = this.#entries.size;
    const bufferSize = 4 + 4 + 4; // Signature + Version + Number of files
    const header = Buffer.alloc(bufferSize);

    header.write(signature, 0, 4);
    header.writeUInt32BE(version, 4);
    header.writeUInt32BE(entryCount, 8);

    return header;
  }

  private clear() {
    this.#entries = new ObjectKeyHash(serialize, deserialize);
    this.#keys.clear();
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
    return this.#fs.open(this.#pathname, constants.O_RDONLY).catch((e: NodeJS.ErrnoException) => {
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
      throw new Invalid(`Signature: expected '${Index.SIGNATURE}' but found '${signature}'`);
    }

    if (version !== Index.VERSION) {
      throw new Invalid(`Version: expected '${Index.VERSION} but found '${version}'`);
    }

    return count;
  }

  private async readEntries(reader: Checksum, count: number) {
    for (const _ of times(count)) {
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
    STAGES.forEach((stage) => this.removeEntryWithStage(pathname, stage));
  }

  private removeEntryWithStage(pathname: Pathname, stage: Stage) {
    const entry = this.#entries.get([pathname, stage]);
    if (!entry) {
      return;
    }

    this.#keys.delete(entry.key);
    this.#entries.delete(entry.key);

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
    this.#entries.set(entry.key, entry);
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

  private isNullChar(char: Buffer) {
    assert.equal(char.length, 1);
    return char.toString() === "\0";
  }
}

function serialize(key: Key) {
  // NULL文字で区切る
  return key.join("\0");
}

function deserialize(s: string) {
  const [pathname, stageStr] = s.split("\0");
  const stage = Number.parseInt(stageStr, 10) as Stage;
  return [pathname, stage] as Key;
}
