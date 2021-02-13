import * as pack from "../pack";
import * as FileService from "../services/FileService";
import { defaultFs } from "../services/FileService";
import { OID, Pathname } from "../types";
import { asserts } from "../util";
import * as fsUtil from "../util/fs";
import * as database from "./database";

interface Environment {
  fs?: FileService.FileService;
}

export class Packed {
  #packFile!: fsUtil.Seekable;
  #reader!: pack.Reader;
  #indexFile!: fsUtil.Seekable;
  #index!: pack.Index;
  #fs: FileService.FileService;
  static async of(
    pathname: Pathname,
    { fs = defaultFs }: Environment = {},
  ): Promise<Packed> {
    if (!pathname.endsWith(".pack")) {
      throw new TypeError("A packfile name's ext should be '.pack'");
    }
    const packed = new this({ fs });
    packed.#packFile = await fsUtil.FileSeeker.fromPath(pathname);
    packed.#reader = new pack.Reader(packed.#packFile);
    packed.#indexFile = await fsUtil.FileSeeker.fromPath(
      pathname.replace(".pack", ".idx"),
    );
    packed.#index = await pack.Index.fromSeekable(packed.#indexFile);
    return packed;
  }

  async has(oid: OID): Promise<boolean> {
    return (await this.#index.oidOffset(oid)) !== undefined;
  }

  async loadRaw(oid: OID): Promise<database.GitRecord | undefined> {
    const offset = await this.#index.oidOffset(oid);
    return offset ? await this.loadRawAt(offset) : undefined;
  }

  private async loadRawAt(offset: number): Promise<database.GitRecord> {
    this.#packFile.seek(offset);
    const record = await this.#reader.readRecord();

    switch (record.kind) {
      case "record":
        return record;
      case "refdelta": {
        const base = await this.loadRaw(record.baseOid);
        asserts(base !== undefined);
        return this.expandDelta(base, record);
      }
    }
  }

  async loadInfo(oid: OID): Promise<database.Raw | undefined> {
    const offset = await this.#index.oidOffset(oid);
    return offset ? await this.loadInfoAt(offset) : undefined;
  }

  private async loadInfoAt(offset: number): Promise<database.Raw> {
    this.#packFile.seek(offset);
    const record = await this.#reader.readInfo();

    switch (record.kind) {
      case "record":
        // dataにサイズが格納されている
        return new database.Raw(record.type, record.data[0]);
      case "refdelta": {
        const base = await this.loadInfo(record.baseOid);
        asserts(base !== undefined);
        // deltaDataにサイズが格納されている
        return new database.Raw(base.type, record.deltaData[0]);
      }
    }
  }

  prefixMatch(name: string) {
    return this.#index.prefixMatch(name);
  }

  private async expandDelta(base: database.GitRecord, record: pack.RefDelta) {
    const data = await pack.Expander.expand(base.data, record.deltaData);
    return pack.Record.of(base.type, data);
  }

  private constructor({ fs }: Required<Environment>) {
    this.#fs = fs;
  }
}
