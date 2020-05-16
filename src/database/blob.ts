import { GitObject, OID } from "../types";

export type Data = Buffer;

export class Blob {
  oid: OID | null = null;
  data: Data;
  constructor(strdata: string) {
    this.data = Buffer.from(strdata, "utf-8");
  }

  static parse(buf: Buffer) {
    return new Blob(buf.toString());
  }

  type() {
    return "blob";
  }

  toString() {
    return this.data.toString();
  }
}
