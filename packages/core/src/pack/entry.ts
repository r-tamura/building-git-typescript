import * as path from "node:path";
import type * as database from "../database/index.js";
import type { OID, Pathname } from "../types.js";
import * as binary from "../util/binary.js";
import type { Delta } from "./delta.js";
import { REF_DELTA, TYPE_CODES } from "./pack.js";

export class Entry {
  #info: database.Raw;
  #pathname: Pathname | undefined;
  delta?: Delta;
  depth = 0;
  offset?: number;
  constructor(
    public oid: OID,
    info: database.Raw,
    pathname: Pathname | undefined,
  ) {
    this.#info = info;
    this.#pathname = pathname;
  }

  assignDelta(delta: Delta) {
    this.delta = delta;
    this.depth += delta.base.depth + 1;
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
    return this.delta ? REF_DELTA : TYPE_CODES[this.#info.type];
  }

  get packedSize() {
    return this.delta ? this.delta.size : this.#info.size;
  }

  get deltaPrefix() {
    return this.delta ? binary.packHex(this.delta.base.oid) : Buffer.alloc(0);
  }
}
