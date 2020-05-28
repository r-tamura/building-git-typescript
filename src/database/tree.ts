import * as path from "path";
import * as Database from "../database";
import { IEntry, Entry } from "../entry";
import { asserts, packHex, scanUntil, unpackHex } from "../util";
import { OID, Pathname, Dict } from "../types";
import { Entry as IndexEntry } from "../gindex";

export type TraverseCallbackFn = (t: Tree) => Promise<void>;

type ValueOf<T> = T[keyof T];

export const MODE = {
  readable: 0o0100644,
  executable: 0o0100755,
  directory: 0o040000,
} as const;
export type ModeNumber = ValueOf<typeof MODE>;
export type ModeStr = "100644" | "100755";
type CommitEntry = Entry | Tree;
export type WriteEntry = Entry | IndexEntry;
export type ReadEntry = Database.Entry;
export type EntryMap = Dict<ReadEntry | IndexEntry | CommitEntry>;
export class Tree {
  static readonly TREE_MODE = 0o040000;

  readonly type = "tree";
  oid: OID | null = null;
  constructor(public entries: EntryMap = {}) {}

  static build(entries: WriteEntry[]) {
    entries.sort(this.ascending);
    const root = new this();

    for (const entry of entries) {
      root.addEntry(entry.parentDirectories, entry);
    }

    return root;
  }

  static parse(buf: Buffer) {
    const entries: EntryMap = {};
    let p: number = 0;
    while (p < buf.length) {
      const [modeStr, offsetName] = scanUntil(" ", buf, p);
      const [name, offsetHash] = scanUntil("\0", buf, offsetName);
      const oid = unpackHex(buf.slice(offsetHash, offsetHash + 20));
      p += offsetHash + 20;
      const mode = Number.parseInt(modeStr, 8);
      asserts(
        mode === 0o0100644 || mode === 0o0100755 || mode === 0o040000,
        `'${mode}'は数値タイプのモード`
      );
      entries[name] = new Database.Entry(oid, mode);
    }

    const root = new this(entries);
    return root;
  }

  addEntry(parents: Pathname[], entry: WriteEntry) {
    if (parents.length === 0) {
      this.entries[entry.basename] = entry;
    } else {
      const treeName = path.basename(parents[0]);
      const tree = (this.entries[treeName] =
        this.entries[treeName] ?? new Tree());
      asserts(tree instanceof Tree);
      parents.shift();
      tree.addEntry(parents, entry);
    }
  }

  async traverse(act: TraverseCallbackFn) {
    // deepest subtree first 深さ優先走査
    for (const [, entry] of Object.entries(this.entries)) {
      if (entry instanceof Tree) {
        await entry.traverse(act);
      }
    }
    await act(this);
  }

  get mode(): ReadEntry["mode"] {
    return Tree.TREE_MODE;
  }

  /**
   *  Treeをシリアライズします
   * それぞれのEntryは MODE + ' ' + Entry#name + '\0' + 20バイトにパックされたOID
   */
  toString() {
    // this.#entries.sort(Tree.ascending)
    const entries = Object.entries(this.entries).map(([name, entry]) => {
      asserts(entry.oid !== null, `Entry.oid of '${name}' is not set yet.`);
      const encodedMode = Buffer.from(entry.mode.toString(8) + " ", "ascii");
      const encodedName = Buffer.from(name + "\0", "ascii");
      const encodedOId = packHex(entry.oid);

      return Buffer.concat([encodedMode, encodedName, encodedOId]);
    });

    const bytes = entries.reduce((buf, acc) => Buffer.concat([buf, acc]));
    return bytes.toString("binary");
  }

  private static ascending(e1: WriteEntry, e2: WriteEntry) {
    return e1.name <= e2.name ? -1 : 1;
  }
}
