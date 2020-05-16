import * as path from "path";
import { Repository } from "./repository";
import * as Database from "../database";
import { Pathname, OID } from "../types";
import { descend, asserts } from "../util";

export type DeleteChange = [Pathname, null];
export type CreateChange = [Pathname, Database.Entry];
export type Changes = {
  delete: DeleteChange[];
  update: CreateChange[];
  create: CreateChange[];
};

export class Migration {
  #diff: Database.Changes;
  #repo: Repository;
  changes: Changes = { create: [], update: [], delete: [] };
  mkdirs: Set<Pathname> = new Set();
  rmdirs: Set<Pathname> = new Set();
  constructor(repo: Repository, diff: Database.Changes) {
    this.#repo = repo;
    this.#diff = diff;
  }

  async applyChanges() {
    this.planChenges();
    await this.updateWorkspace();
    await this.updateIndex();
  }

  async blobData(oid: OID) {
    const blob = await this.#repo.database.load(oid);
    asserts(blob.type === "blob");
    return blob.toString();
  }

  private planChenges() {
    for (const [pathname, [o, n]] of this.#diff) {
      this.recordChange(pathname, o, n);
    }
  }

  private async updateIndex() {
    for (const [pathname] of this.changes["delete"]) {
      this.#repo.index.remove(pathname);
    }

    for (const action of ["create", "update"] as const) {
      for (const [pathname, entry] of this.changes[action]) {
        const stat = await this.#repo.workspace.statFile(pathname);
        asserts(stat !== null);
        this.#repo.index.add(pathname, entry.oid, stat);
      }
    }
  }

  private async updateWorkspace() {
    return this.#repo.workspace.applyMigration(this);
  }

  private recordChange(
    pathname: Pathname,
    oldItem: Database.Entry | null,
    newItem: Database.Entry | null
  ) {
    const parentDirs = descend(path.dirname(pathname));

    const merge = <T>(set: Set<T>, items: T[]) => items.forEach(set.add, set);

    let action: keyof Changes;
    if (newItem === null) {
      merge(this.rmdirs, parentDirs);
      action = "delete";
      this.changes["delete"].push([pathname, newItem]);
    } else if (oldItem === null) {
      merge(this.mkdirs, parentDirs);
      action = "create";
      this.changes[action].push([pathname, newItem]);
    } else {
      merge(this.mkdirs, parentDirs);
      action = "update";
      this.changes[action].push([pathname, newItem]);
    }
  }
}
