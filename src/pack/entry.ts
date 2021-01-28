import * as path from "path";
import * as database from "../database";
import { OID, Pathname } from "../types";
import { TYPE_CODES } from "./pack";

export class Entry {
  #info: database.Raw;
  #pathname: Pathname | undefined;
  #delta = null;
  #depth = 0;
  constructor(
    public oid: OID,
    info: database.Raw,
    pathname: Pathname | undefined,
  ) {
    this.#info = info;
    this.#pathname = pathname;
  }

  get type() {
    return this.#info.type;
  }

  get size() {
    return this.#info.size;
  }

  get sortKeys(): readonly [
    type: number,
    basename: string | undefined,
    dirname: string | undefined,
    size: number,
  ] {
    return [
      this.packedType,
      this.#pathname ? path.basename(this.#pathname) : undefined,
      this.#pathname ? path.dirname(this.#pathname) : undefined,
      this.size,
    ];
  }

  get packedType() {
    return TYPE_CODES[this.#info.type];
  }
}
