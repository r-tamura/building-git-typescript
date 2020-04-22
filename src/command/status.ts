import { Stats } from "fs";
import * as path from "path";
import * as Database from "../database";
import { Base } from "./base";
import { Pathname, OID } from "../types";
import { IEntry } from "../entry";
import { asserts } from "../util";

type IndexStatus = "ADDED" | "MODIFIED" | "DELETED" | "NOCHANGE";
type WorkspaceStatus = "MODIFIED" | "DELETED" | "NOCHANGE";

type ChangeType = IndexStatus | WorkspaceStatus;

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
export class Status extends Base {
  #untrackedFiles: Set<Pathname> = new Set();
  #changed: Set<Pathname> = new Set();
  #stats: { [s: string]: Stats } = {};
  #headTree: { [s: string]: Database.Entry } = {};

  #indexChanges: Map<Pathname, IndexStatus> = new SortedMap();
  #workspaceChanges: Map<Pathname, WorkspaceStatus> = new SortedMap();

  async run() {
    await this.repo.index.loadForUpdate();

    await this.scanWorkspace();
    await this.loadHeadTree();
    await this.checkIndexEntries();
    this.collectDeletedHeadFiles();

    await this.repo.index.writeUpdates();

    this.printResults();
  }

  private async checkIndexEntries() {
    for (const entry of this.repo.index.eachEntry()) {
      await this.checkIndexAgainstWorkspace(entry);
      this.checkIndexAgainstHeadTree(entry);
    }
  }

  private checkIndexAgainstHeadTree(entry: IEntry) {
    const item = this.#headTree[entry.name];

    if (item) {
      if (entry.mode !== item.mode || entry.oid !== item.oid) {
        this.recordChange(entry.name, this.#indexChanges, "MODIFIED");
      }
    } else {
      this.recordChange(entry.name, this.#indexChanges, "ADDED");
    }
  }

  private collectDeletedHeadFiles() {
    Object.keys(this.#headTree).forEach((name) => {
      if (!this.repo.index.trackedFile(name)) {
        this.recordChange(name, this.#indexChanges, "DELETED");
      }
    });
  }

  private async checkIndexAgainstWorkspace(entry: IEntry) {
    const stat = this.#stats[entry.name];

    if (!stat) {
      this.recordChange(entry.name, this.#workspaceChanges, "DELETED");
      return;
    }

    if (!entry.statMatch(stat)) {
      this.recordChange(entry.name, this.#workspaceChanges, "MODIFIED");
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
      this.recordChange(entry.name, this.#workspaceChanges, "MODIFIED");
      return;
    }
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

  private print(alike: Iterable<Pathname>, formatter: (p: Pathname) => string) {
    return Array.from(alike)
      .sort()
      .forEach((p) => {
        this.log(formatter(p));
      });
  }

  static readonly LABEL_WIDTH = 12;
  static LONG_STATUS = {
    ADDED: "new file:",
    DELETED: "deleted:",
    MODIFIED: "modified:",
  } as const;
  private printChanges(
    message: string,
    changeset: Map<Pathname, ChangeType> | Set<Pathname>
  ) {
    if (changeset.size === 0) {
      return;
    }

    this.log(`${message}:`);
    this.log("");
    changeset.forEach((type: string, name: string) => {
      const status = this.isStatusType(type)
        ? Status.LONG_STATUS[type].padEnd(Status.LABEL_WIDTH, " ")
        : "";
      this.log(`\t${status}${name}`);
    });
    this.log("");
  }

  private printCommitStatus() {
    if (this.#indexChanges.size > 0) {
      return;
    }

    if (this.#workspaceChanges.size > 0) {
      this.log("no changes added to commit");
    } else if (this.#untrackedFiles.size > 0) {
      this.log("nothing added to commit but untracked files present");
    } else {
      this.log("nothing to commit, working tree clean");
    }
  }

  private printResults() {
    if (this.args[0] === "--porcelain") {
      this.printPorcelainFormat();
    } else {
      this.printLongFormat();
    }
  }

  private printLongFormat() {
    this.printChanges("Changes to be committed", this.#indexChanges);
    this.printChanges("Changes not staged for commit", this.#workspaceChanges);
    this.printChanges("Untracked files", this.#untrackedFiles);

    this.printCommitStatus();
  }

  private printPorcelainFormat() {
    this.print(this.#changed, (p) => {
      const status = this.statusFor(p);
      return `${status} ${p}`;
    });
    this.print(this.#untrackedFiles, (p) => `?? ${p}`);
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
        this.#headTree[nextPath] = readEntry;
      }
    }
  }

  private recordChange<T>(pathname: Pathname, set: Map<Pathname, T>, type: T) {
    this.#changed.add(pathname);
    set.set(pathname, type);
  }

  private async scanWorkspace(prefix?: string) {
    const entries = await this.repo.workspace.listDir(prefix);
    for (const [pathname, stat] of Object.entries(entries)) {
      if (this.repo.index.tracked(pathname)) {
        if (stat.isFile()) {
          // Stat情報をキャッシュする
          this.#stats[pathname] = stat;
        }
        if (stat.isDirectory()) {
          await this.scanWorkspace(pathname);
        }
      } else if (await this.trackableFile(pathname, stat)) {
        const outputName = stat.isDirectory() ? pathname + path.sep : pathname;
        this.#untrackedFiles.add(outputName);
      }
    }
  }

  private statusFor(pathname: Pathname) {
    const ShortStatus: Record<ChangeType, string> = {
      DELETED: "D",
      ADDED: "A",
      MODIFIED: "M",
      NOCHANGE: " ",
    } as const;

    const left = ShortStatus[this.#indexChanges.get(pathname) ?? "NOCHANGE"];
    const right =
      ShortStatus[this.#workspaceChanges.get(pathname) ?? "NOCHANGE"];

    return left + right;
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

  private isStatusType(
    status: string
  ): status is keyof typeof Status.LONG_STATUS {
    return Object.keys(Status.LONG_STATUS).includes(status);
  }
}
