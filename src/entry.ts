import { OID } from "./types";

export type EntryName = string;

export class Entry {
  oid: OID;
  name: EntryName;

  constructor(name: EntryName, oid: OID) {
    this.name = name;
    this.oid = oid;
  }
}
