import { Stats } from "fs";
import * as path from "path";
import * as Database from "../database";
import { Base } from "./base";
import { Pathname } from "../types";
import { IEntry } from "../entry";

export class Status extends Base {
  #untracked!: Set<Pathname>;
  #changed!: Set<Pathname>;
  #stats: { [s: string]: Stats } = {};
  async run() {
    await this.repo.index.load();

    this.#untracked = new Set();
    this.#changed = new Set();

    await this.scanWorkspace();
    await this.detectWorkspaceChanged();

    this.print(this.#changed, (p) => ` M ${p}`);
    this.print(this.#untracked, (p) => `?? ${p}`);
  }

  private print(alike: Iterable<Pathname>, formatter: (p: Pathname) => string) {
    return Array.from(alike)
      .sort()
      .forEach((p) => {
        this.log(formatter(p));
      });
  }

  private async checkIndexEntry(entry: IEntry) {
    const stat = this.#stats[entry.name];
    if (!entry.statMatch(stat)) {
      this.#changed.add(entry.name);
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
      this.#changed.add(entry.name);
      return;
    }
  }

  private async detectWorkspaceChanged() {
    for (const entry of this.repo.index.eachEntry()) {
      await this.checkIndexEntry(entry);
    }
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
