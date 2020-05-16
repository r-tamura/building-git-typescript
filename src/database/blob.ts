import { GitObject, OID } from "../types";

export type Data = Buffer;

export class Blob {
  readonly type = "blob";
  oid: OID | null = null;
  data: Data;
  constructor(strdata: string) {
    this.data = Buffer.from(strdata, "utf-8");
  }

  static parse(buf: Buffer) {
    return new Blob(buf.toString());
  }

  toString() {
    return this.data.toString();
  }
}
