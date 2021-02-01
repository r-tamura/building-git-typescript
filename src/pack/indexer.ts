import * as crc32lib from "crc-32";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { IDX_SIGNATURE, Reader, SIGNATURE, Stream, VERSION } from ".";
import * as database from "../database";
import * as progress from "../progress";
import { TempFile } from "../tempfile";
import { OID, Pathname } from "../types";
import { asserts } from "../util";
import * as binary from "../util/binary";
import { Hash } from "../util/collection";
import { Expander } from "./expander";
import { IDX_MAX_OFFSET, Record as PackRecord, RefDelta } from "./pack";

type OffsetCrc32Pair = readonly [offset: number, crc32: number];
export class Indexer {
  #database: database.Database;
  #reader: Reader;
  #stream: Stream;
  #progress?: progress.Progress;
  #index: Record<OID, OffsetCrc32Pair> = {};
  /** non-deltifiedオブジェクトに紐づいているdeltifiedオブジェクトのリスト */
  #pending: Hash<OID, OffsetCrc32Pair[]> = new Hash((hash, oid) => {
    hash.set(oid, []);
  });
  #packFile: PackFile;
  #indexFile: PackFile;
  #pack?: Stream;
  #objectIds?: OID[];
  constructor(
    database: database.Database,
    reader: Reader,
    stream: Stream,
    progress?: progress.Progress,
  ) {
    this.#database = database;
    this.#reader = reader;
    this.#stream = stream;
    this.#progress = progress;

    this.#packFile = new PackFile(database.packPath(), "tmp_pack");
    this.#indexFile = new PackFile(database.packPath(), "tmp_idx");
  }

  async processPack(): Promise<void> {
    await this.writeHeader();
    await this.writeObjects();
    await this.writeChecksum();

    await this.resolveDeltas();

    await this.writeIndex();
  }

  private async writeHeader(): Promise<void> {
    const headerSize = 4 + 4 + 4; // Signature + Version + Number of files
    const header = Buffer.alloc(headerSize);

    header.write(SIGNATURE, 0, 4);
    header.writeUInt32BE(VERSION, 4);
    header.writeUInt32BE(this.#reader.count, 8);

    await this.#packFile.write(header);
  }

  private async writeObjects(): Promise<void> {
    this.#progress?.start("Receiving objects", this.#reader.count);

    for (let i = 0; i < this.#reader.count; i++) {
      await this.indexObject();
      this.#progress?.tick();
    }

    this.#progress?.stop();
  }

  private async indexObject() {
    const offset = this.#stream.offset;
    const [record, data] = await this.#stream.capture(() =>
      this.#reader.readRecord(),
    );
    const crc32 = crc32lib.buf(data);

    await this.#packFile.write(data);

    switch (record.kind) {
      case "record": {
        const oid = this.#database.hashObject(record);
        this.#index[oid] = [offset, crc32] as const;
        break;
      }
      case "refdelta":
        this.#pending.get(record.baseOid).push([offset, crc32]);
    }
  }

  private async writeChecksum() {
    await this.#stream.verifyChecksum();

    const filename = `pack-${this.#packFile.digest.digest("hex")}.pack`;
    await this.#packFile.move(filename);

    const packPath = path.join(this.#database.packPath(), filename);
    this.#pack = new Stream(fs.createReadStream(packPath));
    this.#reader = new Reader(this.#pack);
  }

  private async resolveDeltas(): Promise<void> {
    let deltas = 0;
    for (const [, list] of this.#pending.entries()) {
      deltas += list.length;
    }

    this.#progress?.start("Resolving deltas", deltas);
    for (const [oid, [offset]] of Object.entries(this.#index)) {
      const record = await this.readRecordAt(offset);
      asserts(record.kind === "record");
      await this.resolveDeltaBase(record, oid);
    }
    this.#progress?.stop();
  }

  private async resolveDeltaBase(record: PackRecord, oid: OID): Promise<void> {
    const pending = this.#pending.get(oid);
    if (pending === undefined) {
      return;
    }
    this.#pending.delete(oid);

    for (const [offset, crc32] of pending) {
      await this.resolvePending(record, offset, crc32);
    }
  }

  private async resolvePending(
    record: PackRecord,
    offset: number,
    crc32: number,
  ): Promise<void> {
    const delta = await this.readRecordAt(offset);
    asserts(delta.kind === "refdelta");
    const data = await Expander.expand(record.data, delta.deltaData);
    const object = new PackRecord(record.type, data);
    const oid = this.#database.hashObject(object);

    this.#index[oid] = [offset, crc32];
    this.#progress?.tick();

    await this.resolveDeltaBase(object, oid);
  }

  private async readRecordAt(offset: number): Promise<PackRecord | RefDelta> {
    asserts(this.#pack !== undefined);
    this.#pack.seek(offset);
    return await this.#reader.readRecord();
  }

  private async writeIndex(): Promise<void> {
    this.#objectIds = Object.keys(this.#index).sort();

    await this.writeObjectTable();
    await this.writeCrc32();
    await this.writeOffsets();
    await this.writeIndexChecksum();
  }

  private async writeObjectTable(): Promise<void> {
    asserts(this.#objectIds !== undefined);
    const headerSize = 4 + 4; // Index signature(4byte) + version(4byte)
    const header = Buffer.alloc(headerSize);
    header.writeUInt32BE(IDX_SIGNATURE, 0);
    header.writeUInt32BE(VERSION);
    await this.#indexFile.write(header);

    const counts = new Array(256).fill(0) as number[];
    let total = 0;

    for (const oid of this.#objectIds) {
      const oidHead = oid.slice(0, 2);
      counts[Number.parseInt(oidHead, 16)] += 1;
    }

    for (const count of counts) {
      total += count;
      const totalbuf = Buffer.alloc(4); // total(4byte)
      totalbuf.writeUInt32BE(total);
      await this.#indexFile.write(totalbuf);
    }

    for (const oid of this.#objectIds) {
      await this.#indexFile.write(binary.packHex(oid));
    }
  }

  private async writeCrc32(): Promise<void> {
    asserts(this.#objectIds !== undefined);
    for (const oid of this.#objectIds) {
      const [, crc32] = this.#index[oid];
      const crc32buf = binary.packAsInt(crc32);
      await this.#indexFile.write(crc32buf);
    }
  }

  private async writeOffsets(): Promise<void> {
    asserts(this.#objectIds !== undefined);
    const largeOffsets = [] as number[];

    for (const oid of this.#objectIds) {
      let [offset] = this.#index[oid];
      if (offset >= IDX_MAX_OFFSET) {
        largeOffsets.push(offset);
        // JavaScriptのNumber型のbitwiseオペレーションは32bit
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Bitwise_AND
        offset = Number(
          BigInt(IDX_MAX_OFFSET) | BigInt(largeOffsets.length - 1),
        );
      }
      await this.#indexFile.write(binary.packAsInt(offset));
    }

    for (const offset of largeOffsets) {
      await this.#indexFile.write(binary.packAsLong(offset));
    }
  }

  private async writeIndexChecksum(): Promise<void> {
    const packDigest = this.#packFile.digest.digest();
    await this.#indexFile.write(packDigest);

    const filename = `pack-${binary.unpackHex(packDigest)}.idx`;
    await this.#indexFile.move(filename);
  }
}

class PackFile {
  #file: TempFile;
  #digest: crypto.Hash;
  constructor(packDir: Pathname, name: string) {
    this.#file = new TempFile(packDir, name);
    this.#digest = crypto.createHash("sha1");
  }

  async write(data: Buffer): Promise<void> {
    await this.#file.write(data);
    this.#digest.update(data);
  }

  async move(name: string): Promise<void> {
    await this.#file.write(this.#digest.digest());
    await this.#file.move(name);
  }

  get digest(): crypto.Hash {
    return this.#digest.copy();
  }
}
