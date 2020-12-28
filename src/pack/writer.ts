import * as crypto from "crypto";
import { constants } from "zlib";
import * as database from "../database";
import { RevList } from "../rev_list";
import { defaultZlib, Zlib } from "../services";
import { CompleteCommit, OID } from "../types";
import * as numbers from "./numbers";
import { BLOB, COMMIT, GitObjectType, SIGNATURE, TREE, VERSION } from "./pack";

interface Options {
  readonly compressLevel?: number;
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
  #zlib: Zlib;
  constructor(
    output: NodeJS.WritableStream,
    database: database.Database,
    { compressLevel = constants.Z_DEFAULT_COMPRESSION }: Options = {},
    env: Environment = {}
  ) {
    this.#output = output;
    this.#database = database;
    this.#compressLevel = compressLevel;
    this.#zlib = env.zlib ?? defaultZlib;
  }

  async writeObjects(revlist: RevList) {
    await this.preparePackList(revlist);
    this.writeHeader();
    await this.writeEntries();
    this.#output.write(this.#digest.digest());
  }

  private async preparePackList(revlist: RevList) {
    this.#packList = [];
    for await (const object of revlist.eachWithObjects()) {
      this.addToPackList(object);
    }
  }

  private addToPackList(object: CompleteCommit | database.Entry) {
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
    for (const entry of this.#packList) {
      await this.writeEntry(entry);
    }
  }

  private async writeEntry(entry: Entry) {
    const object = await this.#database.loadRaw(entry.oid);
    const header = numbers.VarIntLE.write(object.size);
    header[0] |= entry.type << 4;

    this.write(header);
    this.write(
      await this.#zlib.deflate(object.data, { level: this.#compressLevel })
    );
  }

  private write(data: string | Uint8Array) {
    this.#output.write(data);
    this.#digest.update(data);
  }
}
