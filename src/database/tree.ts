import * as path from "path";
import { Entry, IEntry } from "../entry";
import { asserts, packHex } from "../util";
import { GitObject, OID, Pathname } from "../types";

export type EntryMap = { [s: string]: IEntry | Tree };
export type TraverseCallbackFn = (t: Tree) => Promise<void>;
export class Tree implements GitObject {
  oid: OID | null = null;
  #entries: EntryMap;
  constructor(entries: EntryMap = {}) {
    this.#entries = entries;
  }

  static build(entries: IEntry[]) {
    entries.sort(this.ascending);
    const root = new this();

    for (const entry of entries) {
      root.addEntry(entry.parentDirectories, entry);
    }

    return root;
  }

  addEntry(parents: Pathname[], entry: IEntry) {
    if (parents.length === 0) {
      this.#entries[entry.basename] = entry;
    } else {
      const treeName = parents[0];
      const tree = (this.#entries[treeName] =
        this.#entries[treeName] ?? new Tree());
      asserts(tree instanceof Tree);
      parents.shift();
      tree.addEntry(parents, entry);
    }
  }

  async traverse(act: TraverseCallbackFn) {
    // deepest subtree first 深さ優先走査
    for (const [name, entry] of Object.entries(this.#entries)) {
      if (entry instanceof Tree) {
        await entry.traverse(act);
      }
    }
    await act(this);
  }

  type() {
    return "tree";
  }

  get mode() {
    return Entry.DIRECTORY_MODE;
  }

  /**
   *  Treeをシリアライズします
   * それぞれのEntryは MODE + ' ' + Entry#name + '\0' + 20バイトにパックされたOID
   */
  toString() {
    // this.#entries.sort(Tree.ascending)
    const entries = Object.entries(this.#entries).map(([name, entry]) => {
      asserts(entry.oid !== null, `Entry.oid of '${name}' is not set yet.`);
      const encodedMode = Buffer.from(entry.mode.toString(8) + " ", "ascii");
      const encodedName = Buffer.from(name + "\0", "ascii");
      const encodedOId = packHex(entry.oid);

      return Buffer.concat([encodedMode, encodedName, encodedOId]);
    });

    const bytes = entries.reduce((buf, acc) => Buffer.concat([buf, acc]));
    return bytes.toString("binary");
  }

  private static ascending(e1: IEntry, e2: IEntry) {
    return e1.name <= e2.name ? -1 : 1;
  }
}