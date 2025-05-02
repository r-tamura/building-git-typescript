import { PathFilter } from "../path_filter";
import { OID } from "../types";
import { asserts } from "../util";
import { Database } from "./database";
import { Entry } from "./entry";
import { EntryMap } from "./tree";

type A = Entry | null;
type B = A;
export type Change = [A, B];
export type ChangeMap = Map<string, Change>;
export class TreeDiff {
  #database: Database;
  changes: ChangeMap = new Map();
  constructor(database: Database) {
    this.#database = database;
  }

  async compareOids(a: OID | null, b: OID | null, filter: PathFilter) {
    if (a === b) {
      return;
    }
    const a_tree = a ? (await this.oidToTree(a)).entries : {};
    const b_tree = b ? (await this.oidToTree(b)).entries : {};

    await this.detectDeletions(a_tree, b_tree, filter);
    await this.detectAdditions(a_tree, b_tree, filter);
  }

  private async oidToTree(oid: OID) {
    const object = await this.#database.load(oid);

    switch (object.type) {
      case "commit": {
        const tree = await this.#database.load(object.tree);
        asserts(tree.type === "tree", "Commitオブジェクトが持つGitオブジェクトは/treeです");
        return tree;
      }
      case "tree":
        return object;
      default:
        throw new TypeError("OIDはcommit/treeである必要があります。");
    }
  }

  private async detectDeletions(a: EntryMap, b: EntryMap, filter: PathFilter) {
    for (const [name, entry] of filter.eachEntry(a)) {
      // aにあるオブジェクトがbにない可能性もある
      // オブジェクトでマッピングをしているため、TypeScript上ではundefinedにならない
      // TODO: Tree entriesにMapオブジェクトを使う
      const other = b[name] ?? null;
      // prettier-ignore
      asserts(entry.type === "database", "データベースから読み込まれたエントリ");
      // prettier-ignore
      asserts(other === null || other.type === "database","データベースから読み込まれたエントリ");
      // 同値
      if (other !== null && entry.euqals(other)) {
        continue;
      }

      const subFilter = filter.join(name);

      // Treeの場合
      const [tree_a, tree_b] = [entry, other].map((e: Entry | null) =>
        e?.tree() ? e.oid : null,
      );
      await this.compareOids(tree_a, tree_b, subFilter);

      // Blobの場合
      const blobs = [
        entry?.tree() ? null : entry,
        other?.tree() ? null : other,
      ] as Change;

      if (blobs[0] || blobs[1]) {
        this.changes.set(subFilter.pathname, blobs);
      }
    }
  }

  private async detectAdditions(a: EntryMap, b: EntryMap, filter: PathFilter) {
    for (const [name, entry] of filter.eachEntry(b)) {
      // bにあるオブジェクトがaにない可能性もある
      // オブジェクトでマッピングをしているため、TypeScript上ではundefinedにならない
      // TODO: Tree entriesにMapオブジェクトを使う
      const other = a[name] as Entry;
      asserts(entry.type === "database");

      const subFilter = filter.join(name);

      if (other) {
        continue;
      }
      if (entry.tree()) {
        await this.compareOids(null, entry.oid, subFilter);
      } else {
        this.changes.set(subFilter.pathname, [null, entry]);
      }
    }
  }
}
