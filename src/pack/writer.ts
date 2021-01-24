import * as crypto from "crypto";
import { constants } from "zlib";
import * as database from "../database";
import { Progress } from "../progress";
import { RevList } from "../rev_list";
import { defaultZlib, Zlib } from "../services";
import { CompleteCommit, OID, Pathname } from "../types";
import * as numbers from "./numbers";
import { BLOB, COMMIT, GitObjectType, SIGNATURE, TREE, VERSION } from "./pack";

interface Options {
  readonly compressLevel?: number;
  readonly progress?: Progress;
}

interface Environment {
  zlib?: Zlib;
}

class Entry {
  constructor(public oid: OID, public type: GitObjectType) {}
}

export class Writer {
  #output: NodeJS.WritableStream;
  #database: database.Database;
  #digest: crypto.Hash = crypto.createHash("sha1");
  #compressLevel: number;
  #packList: Entry[] = [];
  /** 書き込んだデータ量(byte)の合計 */
  #offset = 0;
  #progress?: Progress;
  #zlib: Zlib;
  constructor(
    output: NodeJS.WritableStream,
    database: database.Database,
    { compressLevel = constants.Z_DEFAULT_COMPRESSION, progress }: Options = {},
    env: Environment = {}
  ) {
    this.#output = output;
    this.#database = database;
    this.#compressLevel = compressLevel;
    this.#zlib = env.zlib ?? defaultZlib;
    this.#progress = progress;
  }

  async writeObjects(revlist: RevList) {
    await this.preparePackList(revlist);
    this.writeHeader();
    await this.writeEntries();

    const digest = this.#digest.digest();

    this.#output.write(digest);
    this.#output.end();
  }

  private async preparePackList(revlist: RevList) {
    this.#packList = [];
    this.#progress?.start("Counting objects");

    for await (const [object, pathname] of revlist.eachWithObjects()) {
      this.addToPackList(object);
      this.#progress?.tick();
    }
    this.#progress?.stop();
  }

  private addToPackList(
    object: CompleteCommit | database.Entry,
    pathname?: Pathname
  ) {
    if (object.type === "commit") {
      // Database.Commit
      this.#packList.push(new Entry(object.oid, COMMIT));
    } else if (object instanceof database.Entry) {
      // Database.Entry (Tree or Blob)
      const type = object.tree() ? TREE : BLOB;
      this.#packList.push(new Entry(object.oid, type));
    }
  }

  private writeHeader() {
    /**
     *   4 Bytes                4 Bytes              4 Bytes
        +---------------------+--------------------+--------------------+
        |  Signature          | Version            | Object counts      |
        +---------------------+--------------------+--------------------+
     */
    const headerSize = 4 + 4 + 4; // Signature + Version + Number of files
    const header = Buffer.alloc(headerSize);

    header.write(SIGNATURE, 0, 4);
    header.writeUInt32BE(VERSION, 4);
    header.writeUInt32BE(this.#packList.length, 8);

    this.#output.write(header);
  }

  private async writeEntries() {
    const count = this.#packList.length;

    if (this.#output === process.stdout) {
      this.#progress?.start("Writing objects", count);
    }

    for (const entry of this.#packList) {
      await this.writeEntry(entry);
    }
    this.#progress?.stop();
  }

  private async writeEntry(entry: Entry) {
    const object = await this.#database.loadRaw(entry.oid);
    const header = numbers.VarIntLE.write(
      object.size,
      numbers.VarIntLE.SHIFT_FOR_FIRST
    );
    header[0] |= entry.type << 4;
    // fs.writeFileSync(out, header, { flag: "a" });
    const compressed = await this.#zlib.deflate(object.data, {
      level: this.#compressLevel,
    });
    this.write(header);
    this.write(compressed);
    this.#progress?.tick();
  }

  private write(data: Buffer | Uint8Array) {
    this.#output.write(data);
    this.#digest.update(data);
    this.#offset += data.byteLength;
  }
}
