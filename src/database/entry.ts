import { Tree } from "./tree";
import { ModeNumber } from "../entry";
import { OID } from "../types";

export class Entry {
  readonly type = "database";
  constructor(public oid: OID, public mode: ModeNumber) {}

  static equals(e1: Entry, e2: Entry) {
    return e1.euqals(e2);
  }

  tree() {
    return this.mode === Tree.TREE_MODE;
  }

  euqals(other: Entry) {
    return this.mode === other.mode && this.oid === other.oid;
  }
}
