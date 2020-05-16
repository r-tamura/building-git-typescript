import { Stats } from "fs";
import * as path from "path";
import { Pathname, OID } from "../types";
import { Repository } from "./repository";
import * as Database from "../database";
import { asserts } from "../util";
import { IEntry } from "~/entry";

export type IndexStatus = "added" | "modified" | "deleted" | "nochange";
export type WorkspaceStatus = "modified" | "deleted" | "nochange";

export type ChangeType = IndexStatus | WorkspaceStatus;

export class Status {
  changed: Set<Pathname> = new Set();
  indexChanges: Map<Pathname, IndexStatus> = new SortedMap();
  workspaceChanges: Map<Pathname, WorkspaceStatus> = new SortedMap();
  untrackedFiles: Set<Pathname> = new Set();

  headTree: { [s: string]: Database.Entry } = {};
  stats: { [s: string]: Stats } = {};

  constructor(public repo: Repository) {}

  static async of(repo: Repository) {
    const status = new this(repo);
    await status.scanWorkspace();
    await status.loadHeadTree();
    await status.checkIndexEntries();
    status.collectDeletedHeadFiles();
    return status;
  }
  async checkIndexEntries() {
    for (const entry of this.repo.index.eachEntry()) {
      await this.checkIndexAgainstWorkspace(entry);
      this.checkIndexAgainstHeadTree(entry);
    }
  }
  collectDeletedHeadFiles() {
    Object.keys(this.headTree).forEach((name) => {
      if (!this.repo.index.trackedFile(name)) {
        this.recordChange(name, this.indexChanges, "deleted");
      }
    });
  }

  private async loadHeadTree() {
    const headOid = await this.repo.refs.readHead();
    if (!headOid) {
      return;
    }

    const commit = await this.repo.database.load(headOid);
    asserts(commit instanceof Database.Commit, "instanceof Commit");
    await this.readTree(commit.tree);
  }

  async scanWorkspace(prefix?: string) {
    const entries = await this.repo.workspace.listDir(prefix);
    for (const [pathname, stat] of Object.entries(entries)) {
      if (this.repo.index.tracked(pathname)) {
        if (stat.isFile()) {
          // Stat情報をキャッシュする
          this.stats[pathname] = stat;
        }
        if (stat.isDirectory()) {
          await this.scanWorkspace(pathname);
        }
      } else if (await this.trackableFile(pathname, stat)) {
        const outputName = stat.isDirectory() ? pathname + path.sep : pathname;
        this.untrackedFiles.add(outputName);
      }
    }
  }

  private checkIndexAgainstHeadTree(entry: IEntry) {
    const item = this.headTree[entry.name];

    if (item) {
      if (entry.mode !== item.mode || entry.oid !== item.oid) {
        this.recordChange(entry.name, this.indexChanges, "modified");
      }
    } else {
      this.recordChange(entry.name, this.indexChanges, "added");
    }
  }

  private async checkIndexAgainstWorkspace(entry: IEntry) {
    const stat = this.stats[entry.name];

    if (!stat) {
      this.recordChange(entry.name, this.workspaceChanges, "deleted");
      return;
    }

    if (!entry.statMatch(stat)) {
      this.recordChange(entry.name, this.workspaceChanges, "modified");
      return;
    }

    if (entry.timesMatch(stat)) {
      return;
    }

    const data = await this.repo.workspace.readFile(entry.name);
    const blob = new Database.Blob(data);
    const oid = this.repo.database.hashObject(blob);

    if (entry.oid === oid) {
      this.repo.index.updateEntryStat(entry, stat);
    } else {
      this.recordChange(entry.name, this.workspaceChanges, "modified");
      return;
    }
  }

  private async readTree(treeOid: OID, pathname: Pathname = "") {
    const tree = await this.repo.database.load(treeOid);
    asserts(tree instanceof Database.Tree);

    for (const [name, entry] of Object.entries(tree.entries)) {
      const nextPath = path.join(pathname, name);
      const readEntry = entry as Database.Entry;
      if (readEntry.tree()) {
        asserts(entry.oid !== null);
        await this.readTree(entry.oid, nextPath);
      } else {
        this.headTree[nextPath] = readEntry;
      }
    }
  }

  private recordChange<T>(pathname: Pathname, set: Map<Pathname, T>, type: T) {
    this.changed.add(pathname);
    set.set(pathname, type);
  }

  private async trackableFile(pathname: Pathname, stat: Stats) {
    if (stat.isFile()) {
      return !this.repo.index.tracked(pathname);
    }
    if (!stat.isDirectory()) {
      return false;
    }

    const entries = await this.repo.workspace.listDir(pathname);

    const files = Object.entries(entries).filter(([p, stat]) => stat.isFile());
    const dirs = Object.entries(entries).filter(([p, stat]) =>
      stat.isDirectory()
    );

    for (const map of [files, dirs]) {
      for (const [p, s] of map) {
        const res = await this.trackableFile(p, s);
        if (res) {
          return true;
        }
      }
    }
    return false;
  }
}

class SortedMap<T, U> extends Map<T, U> {
  #keys: Set<T> = new Set();

  set(key: T, value: U) {
    this.#keys.add(key);
    super.set(key, value);
    return this;
  }

  forEach(callbackfn: (value: U, key: T, map: Map<T, U>) => void): void {
    Array.from(this.#keys)
      .sort()
      .forEach((key) => {
        const value = super.get(key);
        if (typeof value === "undefined") {
          return;
        }
        callbackfn(value, key, this);
      });
  }
}
