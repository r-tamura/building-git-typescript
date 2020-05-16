import * as path from "path";
import { Entry } from "./entry";
import { Database } from "./database";
import { Pathname, OID } from "../types";
import { Tree, EntryMap, ReadEntry } from "./tree";
import { asserts } from "../util";

type A = Entry | null;
type B = A;
type Change = [A, B];
type Changes = Map<string, Change>;
export class TreeDiff {
  #database: Database;
  changes: Changes = new Map();
  constructor(database: Database) {
    this.#database = database;
  }

  async compareOids(a: OID | null, b: OID | null, prefix: Pathname = "") {
    if (a === b) {
      return;
    }

    const a_tree = a ? (await this.oidToTree(a)).entries : {};
    const b_tree = b ? (await this.oidToTree(b)).entries : {};

    await this.detectDeletions(a_tree, b_tree, prefix);
    await this.detectAdditions(a_tree, b_tree, prefix);
  }

  private async oidToTree(oid: OID) {
    const object = await this.#database.load(oid);

    switch (object.type) {
      case "commit": {
        const tree = await this.#database.load(object.tree);
        return tree as Tree;
      }
      case "tree":
        return object;
      default:
        throw new TypeError("OIDはcommit/treeである必要があります。");
    }
  }

  private async detectDeletions(a: EntryMap, b: EntryMap, prefix: Pathname) {
    for (const [name, entry] of Object.entries(a)) {
      const pathname = path.join(prefix, name);
      // aにあるオブジェクトがbにない可能性もある
      // オブジェクトでマッピングをしているため、TypeScript上ではundefinedにならない
      // TODO: Tree entriesにMapオブジェクトを使う
      const other = b[name] ?? null;
      asserts(
        entry.type === "database",
        "データベースから読み込まれたエントリ"
      );
      asserts(
        other === null || other.type === "database",
        "データベースから読み込まれたエントリ"
      );
      // 同値
      if (other !== null && entry.euqals(other)) {
        continue;
      }

      // Treeの場合
      const [tree_a, tree_b] = [entry, other].map((e: Entry | null) =>
        e?.tree() ? e.oid : null
      );
      await this.compareOids(tree_a, tree_b, pathname);

      // Blobの場合
      const blobs = [entry, other].map((e: Entry | null) =>
        e?.tree() ? null : e
      ) as Change;
      if (blobs.some((e) => e !== null)) {
        this.changes.set(pathname, blobs);
      }
    }
  }

  private async detectAdditions(a: EntryMap, b: EntryMap, prefix: Pathname) {
    for (const [name, entry] of Object.entries(b)) {
      const pathname = path.join(prefix, name);
      // bにあるオブジェクトがaにない可能性もある
      // オブジェクトでマッピングをしているため、TypeScript上ではundefinedにならない
      // TODO: Tree entriesにMapオブジェクトを使う
      const other = a[name] as Entry;
      asserts(entry.type === "database");

      if (other) {
        return;
      }

      if (entry.tree()) {
        await this.compareOids(null, entry.oid, pathname);
      } else {
        this.changes.set(pathname, [null, entry]);
      }
    }
  }
}

function entryEquals(e1: ReadEntry | Tree, e2: ReadEntry | Tree) {
  return e1.mode === e2.mode && e1.oid === e2.oid;
}
