import { Stats } from "fs";
import * as os from "os";
import * as path from "path";
import * as Database from "../database";
import * as Index from "../gindex";
import { OID, Pathname } from "../types";
import { ascend, asserts, BaseError, descendUnix, PosixPath } from "../util";
import { Inspector } from "./inspector";
import { Repository } from "./repository";

export type DeleteChange = [PosixPath, null];
export type CreateChange = [PosixPath, Database.Entry];
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
  #diff: Database.ChangeMap;
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
  constructor(repo: Repository, diff: Database.ChangeMap) {
    this.#repo = repo;
    this.#diff = diff;
    this.#inspector = new Inspector(repo);
  }

  async applyChanges() {
    await this.planChanges();
    await this.updateWorkspace();
    await this.updateIndex();
  }

  async blobData(oid: OID) {
    const blob = await this.#repo.database.load(oid);
    asserts(blob.type === "blob");
    return blob.toString();
  }

  private async checkForConflict(
    pathname: PosixPath,
    oldItem: Database.Entry | null,
    newItem: Database.Entry | null,
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
        stat,
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
    newItem: Database.Entry | null,
  ) {
    return (
      this.#inspector.compareTreeToIndex(oldItem, entry) &&
      this.#inspector.compareTreeToIndex(newItem, entry)
    );
  }

  private getErrorType(
    stat: Stats | null,
    entry: Index.Entry | null,
    item: Database.Entry | null,
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

  private async planChanges() {
    for (const [pathname, [oldItem, newItem]] of this.#diff) {
      await this.checkForConflict(pathname, oldItem, newItem);
      this.recordChange(pathname, oldItem, newItem);
    }
    this.collectErrors();
  }

  private async untrackedParent(pathname: Pathname) {
    for (const parent of ascend(path.posix.dirname(pathname))) {
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
      await this.#repo.index.remove(pathname);
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
    pathname: PosixPath,
    oldItem: Database.Entry | null,
    newItem: Database.Entry | null,
  ) {
    const parentDirs = descendUnix(path.posix.dirname(pathname));

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
