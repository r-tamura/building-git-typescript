import * as path from "node:path";
import { defaultFs } from "../services/index.js";
import type { OID, Pathname } from "../types.js";
import * as errorUtil from "../util/index.js";
import { BaseError } from "../util/index.js";
import * as array from "../util/array.js";
import type { Backend, GitRecord, Raw } from "./database.js";
import type { Environment } from "./loose.js";
import { Loose } from "./loose.js";
import { Packed } from "./packed.js";

export class Backends implements Backend {
  #pathname: Pathname;
  #loose: Loose;
  #stores: (Backend | Packed)[] | undefined;
  #fs: Required<Environment>["fs"];

  constructor(pathname: Pathname, env: Environment) {
    this.#pathname = pathname;
    this.#loose = new Loose(pathname, env);
    this.#fs = env.fs ?? defaultFs;
  }

  private get packPath(): Pathname {
    return path.join(this.#pathname, "pack");
  }

  private async packed(_pathname?: Pathname): Promise<Packed[]> {
    const files = await this.#fs
      .readdir(this.packPath)
      .catch((err: unknown) => {
        if (errorUtil.isNodeError(err)) {
          if (err.code === "ENOENT") {
            return [];
          }
        }
        throw err;
      });
    const packs = array
      .grep(files, /\.pack$/)
      .map((name) => path.join(this.packPath, name))
      .sort((name1, name2) => name2.localeCompare(name1));

    return Promise.all(packs.map((pathname) => Packed.of(pathname)));
  }

  async has(oid: OID): Promise<boolean> {
    for (const store of await this.stores()) {
      if ((await store.has(oid)) === true) {
        return true;
      }
    }
    return false;
  }

  async loadRaw(oid: OID): Promise<GitRecord> {
    for (const store of await this.stores()) {
      const raw = await store.loadRaw(oid);
      if (raw !== undefined) {
        return raw;
      }
    }
    throw new BaseError(`Could not find '${oid}' does not exist.`);
  }

  async loadInfo(oid: OID): Promise<Raw> {
    for (const store of await this.stores()) {
      const raw = await store.loadInfo(oid);
      if (raw !== undefined) {
        return raw;
      }
    }
    throw new BaseError(`Could not find '${oid}' does not exist.`);
  }

  async prefixMatch(name: string): Promise<OID[]> {
    const oids = [] as OID[];
    for (const store of await this.stores()) {
      oids.push(...(await store.prefixMatch(name)));
    }
    return oids;
  }

  async writeObject(oid: OID, content: Buffer): Promise<void> {
    await this.#loose.writeObject(oid, content);
  }

  private async stores(): Promise<(Backend | Packed)[]> {
    return (this.#stores ??= [this.#loose, ...(await this.packed())]);
  }
}
