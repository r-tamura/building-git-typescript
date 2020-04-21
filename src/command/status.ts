import { Stats } from "fs";
import * as path from "path";
import * as Database from "../database";
import { Base } from "./base";
import { Pathname, OID } from "../types";
import { IEntry } from "../entry";
import { asserts } from "~/util";

const status = {
  INDEX_ADDED: Symbol("A"),
  INDEX_MODIFIED: Symbol("M"),
  WORKSPACE_DELETED: Symbol("D"),
  WORKSPACE_MODIFIED: Symbol("M"),
} as const;

type ChangedType = typeof status[keyof typeof status];
export class Status extends Base {
  #untracked: Set<Pathname> = new Set();
  #changed: Set<Pathname> = new Set();
  #changes: Map<Pathname, Set<ChangedType>> = new Map();
  #stats: { [s: string]: Stats } = {};
  #headTree: { [s: string]: Database.Entry } = {};
  async run() {
    await this.repo.index.loadForUpdate();

    await this.scanWorkspace();
    await this.loadHeadTree();
    await this.checkIndexEntries();

    await this.repo.index.writeUpdates();

    this.printResults();
  }

  private async checkIndexEntries() {
    for (const entry of this.repo.index.eachEntry()) {
      await this.checkIndexAgainstWorkspace(entry);
      this.checkIndexAgainstHeadTree(entry);
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

  private async checkIndexAgainstWorkspace(entry: IEntry) {
    const stat = this.#stats[entry.name];

    if (!stat) {
      this.recordChange(entry.name, status.WORKSPACE_DELETED);
      return;
    }

    if (!entry.statMatch(stat)) {
      this.recordChange(entry.name, status.WORKSPACE_MODIFIED);
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
      this.recordChange(entry.name, status.WORKSPACE_MODIFIED);
      return;
    }
  }

  private checkIndexAgainstHeadTree(entry: IEntry) {
    const item = this.#headTree[entry.name];

    if (item) {
      if (entry.mode !== item.mode || entry.oid !== item.oid) {
        this.recordChange(entry.name, status.INDEX_MODIFIED);
      }
    } else {
      this.recordChange(entry.name, status.INDEX_ADDED);
    }
  }

  private recordChange(pathname: Pathname, type: ChangedType) {
    this.#changed.add(pathname);
    if (!this.#changes.has(pathname)) {
      this.#changes.set(pathname, new Set());
    }
    this.#changes.get(pathname)?.add(type);
  }

  private printResults() {
    this.print(this.#changed, (p) => {
      const status = this.statusFor(p);
      return `${status} ${p}`;
    });
    this.print(this.#untracked, (p) => `?? ${p}`);
  }

  private print(alike: Iterable<Pathname>, formatter: (p: Pathname) => string) {
    return Array.from(alike)
      .sort()
      .forEach((p) => {
        this.log(formatter(p));
      });
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
        this.#untracked.add(outputName);
      }
    }
  }

  private statusFor(pathname: Pathname) {
    const changes = this.#changes.get(pathname);
    // prettier-ignore
    const left  = changes?.has(status.INDEX_ADDED) ? "A"
                : changes?.has(status.INDEX_MODIFIED) ? "M"
                : " "
    // prettier-ignore
    const right = changes?.has(status.WORKSPACE_MODIFIED) ? "M"
                : changes?.has(status.WORKSPACE_DELETED)  ? "D"
                : " "

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
}
