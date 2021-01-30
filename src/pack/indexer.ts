import * as crc32lib from "crc-32";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { Reader, SIGNATURE, Stream, VERSION } from ".";
import * as database from "../database";
import * as progress from "../progress";
import { TempFile } from "../tempfile";
import { OID, Pathname } from "../types";
import { asserts } from "../util";
import { Hash } from "../util/collection";
import { Record as PackRecord, RefDelta } from "./pack";

type OffsetCrc32Pair = readonly [offset: number, crc32: number];
export class Indexer {
  #database: database.Database;
  #reader: Reader;
  #stream: Stream;
  #progress?: progress.Progress;
  #index: Record<OID, OffsetCrc32Pair> = {};
  #pending: Hash<OID, OffsetCrc32Pair[]> = new Hash((hash, oid) => {
    hash.set(oid, []);
  });
  #packFile: PackFile;
  #pack?: Stream;
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
  }

  async processPack(): Promise<void> {
    await this.writeHeader();
    await this.writeObjects();
    await this.writeChecksum();

    // await this.resolveDeltas();

    // await this.writeIndex();
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

  private async readRecordAt(offset: number): Promise<PackRecord | RefDelta> {
    asserts(this.#pack !== undefined);
    this.#pack.seek(offset);
    return await this.#reader.readRecord();
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
