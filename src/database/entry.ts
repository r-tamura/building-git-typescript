import { Tree, ReadEntry } from "./tree";
import { ModeNumber } from "../entry";
import { OID } from "../types";

export class Entry implements ReadEntry {
  constructor(public oid: OID, public mode: ModeNumber) {}

  tree() {
    return this.mode === Tree.TREE_MODE;
  }
}
