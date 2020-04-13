/**
 * Note: index.jsはNodeJSでは特別な扱いをされるためgitのindexを扱う機能のファイル名はgindex.js (git index) とする
 */
import * as crypto from "crypto";
import { Stats } from "fs";
import { Pathname, OID } from "../types";
import { Lockfile, LockfileEnvironment } from "../lockfile";
import { asserts, packSha1 } from "../util";
import { Entry } from "./entry";

type IndexEntryMap = { [s: string]: Entry };

export class Index {
  #entries: IndexEntryMap;
  #lockfile: Lockfile;
  #digest: crypto.Hash | undefined;
  constructor(pathname: Pathname, env?: LockfileEnvironment) {
    this.#entries = {};
    this.#lockfile = new Lockfile(pathname, env);
  }

  add(pathname: Pathname, oid: OID, stat: Stats) {
    const entry = Entry.create(pathname, oid, stat);
    this.#entries[pathname] = entry;
  }

  async writeUpdates() {
    if (!(await this.#lockfile.holdForUpdate())) {
      return false;
    }

    this.beginWrite();

    const header = this.buildHeader();
    await this.write(header.toString("binary"));

    for (const entry of Object.values(this.#entries)) {
      await this.write(entry.toString());
    }
    await this.finishWrite();
    return true;
  }

  private buildHeader() {
    const signature = "DIRC";
    const version = 2;
    const entryCount = Object.keys(this.#entries).length;
    const bufferSize = 4 + 4 + 4;
    const header = Buffer.alloc(bufferSize);

    header.write(signature, 0, 4);
    header.writeUInt32BE(version, 4);
    header.writeUInt32BE(entryCount, 8);

    return header;
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
}
