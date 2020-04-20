import { Stats } from "fs";
import * as path from "path";
import * as Database from "../database";
import { Base } from "./base";
import { Pathname } from "../types";
import { IEntry, Entry } from "../entry";

type D = "D";
type M = "M";
type ChangedType = D | M;
export class Status extends Base {
  static readonly WorkspaceDeleted: D = "D";
  static readonly WorkspaceModified: M = "M";
  #untracked!: Set<Pathname>;
  #changed!: Set<Pathname>;
  #changes: Map<Pathname, Set<ChangedType>> = new Map();
  #stats: { [s: string]: Stats } = {};
  async run() {
    await this.repo.index.load();

    this.#untracked = new Set();
    this.#changed = new Set();

    await this.scanWorkspace();
    await this.detectWorkspaceChanged();

    this.printResults();
  }

  private async checkIndexEntry(entry: IEntry) {
    const stat = this.#stats[entry.name];

    if (!stat) {
      this.recordChange(entry.name, Status.WorkspaceDeleted);
      return;
    }

    if (!entry.statMatch(stat)) {
      this.recordChange(entry.name, Status.WorkspaceModified);
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
      this.recordChange(entry.name, Status.WorkspaceModified);
      return;
    }
  }

  private async detectWorkspaceChanged() {
    for (const entry of this.repo.index.eachEntry()) {
      await this.checkIndexEntry(entry);
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
    return changes?.has(Status.WorkspaceModified) ? " M"
      : changes?.has(Status.WorkspaceDeleted) ? " D"
      : "  "
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
