import { Database } from "../database";
import { OID } from "../types";
import { CommonAncestors } from "./common_anncestors";
import { exclude, merge } from "~/util";

export class Base {
  #database: Database;
  #common!: CommonAncestors;
  #commits: OID[] = [];
  #redundant: Set<OID> = new Set();
  private constructor(database: Database) {
    this.#database = database;
  }

  static async of(database: Database, one: OID, two: OID) {
    const self = new Base(database);
    self.#database = database;
    self.#common = await CommonAncestors.of(database, one, [two]);
    return self;
  }

  /**
   * BCAを探索します
   * 複数のCAが存在する場合は、
   */
  async find() {
    this.#commits = await this.#common.find();
    if (this.#commits.length <= 1) {
      // BCAがない or BCAが一つの場合
      return this.#commits;
    }

    for (const commit of this.#commits) {
      await this.filterCommit(commit);
    }
    return exclude(this.#commits, Array.from(this.#redundant));
  }

  private async filterCommit(commit: OID) {
    if (this.#redundant.has(commit)) {
      return;
    }
    const others = exclude(this.#commits, [commit, ...this.#redundant]);
    const common = await CommonAncestors.of(this.#database, commit, others);

    await common.find();

    if (common.marked(commit, "parent2")) {
      this.#redundant.add(commit);
    }

    const othersSet = new Set(
      others.filter((oid) => common.marked(oid, "parent1"))
    );
    return (this.#redundant = merge(this.#redundant, othersSet));
  }
}
