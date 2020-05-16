import * as path from "path";
import * as os from "os";
import { Repository } from "./repository";
import * as Database from "../database";
import * as Index from "../gindex";
import { Pathname, OID } from "../types";
import { descend, asserts, BaseError, ascend } from "../util";
import { Inspector } from "./inspector";
import { Stats } from "fs";

export type DeleteChange = [Pathname, null];
export type CreateChange = [Pathname, Database.Entry];
export type Changes = {
  delete: DeleteChange[];
  update: CreateChange[];
  create: CreateChange[];
};

export class Conflict extends BaseError {}

type Conflicts = Record<
  | "stale_file"
  | "stale_directory"
  | "untracked_overwritten"
  | "untracked_removed",
  Set<string>
>;

const MESSAGES: Record<keyof Conflicts, [string, string]> = {
  stale_file: [
    "Your local changes to the following files would be overwritten by checkout:",
    "Please commit your changes or stash them before you switch branches.",
  ],
  stale_directory: [
    "Updating the following directories would lose untracked files in them:",
    "\n",
  ],
  untracked_overwritten: [
    "The following untracked working tree files would be overwritten by checkout:",
    "Please move or remove them before you switch branches.",
  ],
  untracked_removed: [
    "The following untracked working tree files would be removed by checkout:",
    "Please move or remove them before you switch branches.",
  ],
};
export class Migration {
  #diff: Database.Changes;
  #repo: Repository;
  changes: Changes = { create: [], update: [], delete: [] };
  mkdirs: Set<Pathname> = new Set();
  rmdirs: Set<Pathname> = new Set();

  #inspector: Inspector;
  errors: string[] = [];
  #conflicts: Conflicts = {
    stale_file: new Set(),
    stale_directory: new Set(),
    untracked_overwritten: new Set(),
    untracked_removed: new Set(),
  };
  constructor(repo: Repository, diff: Database.Changes) {
    this.#repo = repo;
    this.#diff = diff;
    this.#inspector = new Inspector(repo);
  }

  async applyChanges() {
    await this.planChenges();
    await this.updateWorkspace();
    await this.updateIndex();
  }

  async blobData(oid: OID) {
    const blob = await this.#repo.database.load(oid);
    asserts(blob.type === "blob");
    return blob.toString();
  }

  private async checkForConflict(
    pathname: Pathname,
    oldItem: Database.Entry | null,
    newItem: Database.Entry | null
  ) {
    const entry = this.#repo.index.entryForPath(pathname);

    // indexとの比較
    // 1. indexとHEADで違いがなければuncommitedファイルではない
    // 2. indexとcheckout先で違いがなければ上書きされても変わらない
    if (this.indexDiffersFromTrees(entry, oldItem, newItem)) {
      this.#conflicts["stale_file"].add(pathname);
      return;
    }
    const stat = await this.#repo.workspace.statFile(pathname);
    const type = this.getErrorType(stat, entry, newItem);

    if (stat === null) {
      // workspaceにファイルがないとき
      const parent = await this.untrackedParent(pathname);
      if (parent) {
        this.#conflicts[type].add(entry ? pathname : parent);
      }
    } else if (stat.isFile()) {
      // indexとの差分がある
      const changed = await this.#inspector.compareIndexToWorkspace(
        entry,
        stat
      );
      if (changed) {
        this.#conflicts[type].add(pathname);
      }
    } else if (stat.isDirectory()) {
      // ディレクトリ内にuntracked fileを含む
      const trackable = await this.#inspector.trackableFile(pathname, stat);
      if (trackable) {
        this.#conflicts[type].add(pathname);
      }
    }
  }

  private collectErrors() {
    Object.entries(this.#conflicts).forEach(([type, pathnames]) => {
      if (pathnames.size === 0) {
        return;
      }

      const lines = Array.from(pathnames).map((name) => `\t${name}`);
      const [header, footer] = MESSAGES[type as keyof Conflicts];
      this.errors.push([header, ...lines, footer].join(os.EOL));
    });

    if (this.errors.length > 0) {
      throw new Conflict();
    }
  }

  private indexDiffersFromTrees(
    entry: Index.Entry | null,
    oldItem: Database.Entry | null,
    newItem: Database.Entry | null
  ) {
    return (
      this.#inspector.compareTreeToIndex(oldItem, entry) &&
      this.#inspector.compareTreeToIndex(newItem, entry)
    );
  }

  private getErrorType(
    stat: Stats | null,
    entry: Index.Entry | null,
    item: Database.Entry | null
  ): keyof Conflicts {
    if (entry) {
      return "stale_file";
    } else if (stat?.isDirectory()) {
      return "stale_directory";
    } else if (item) {
      return "untracked_overwritten";
    }
    return "untracked_removed";
  }

  private async planChenges() {
    for (const [pathname, [o, n]] of this.#diff) {
      await this.checkForConflict(pathname, o, n);
      this.recordChange(pathname, o, n);
    }
    this.collectErrors();
  }

  private async untrackedParent(pathname: Pathname) {
    for (const parent of ascend(path.dirname(pathname))) {
      if (parent === ".") {
        continue;
      }
      const parentStat = await this.#repo.workspace.statFile(parent);

      if (!parentStat?.isFile()) {
        continue;
      }

      const trackable = await this.#inspector.trackableFile(parent, parentStat);
      if (trackable) {
        return parent;
      }
    }
    return null;
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
