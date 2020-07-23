import { Stats } from "fs";
import { Repository } from "./repository";
import { Pathname } from "../types";
import * as Index from "../gindex";
import * as Database from "../database";

export type IndexStatus = "added" | "modified" | "deleted" | null;
export type WorkspaceStatus = "untracked" | "modified" | "deleted" | null;

export class Inspector {
  #repo: Repository;

  constructor(repo: Repository) {
    this.#repo = repo;
  }

  /**
   * ファイルがtrackableであるかを判定します
   * trackableの条件は以下のいづれかです
   *  - untacked file
   *  - untracked fileを持つディレクトリ
   * @param pathname ファイルパス
   * @param stat ファイルstat
   */
  async trackableFile(pathname: Pathname, stat: Stats) {
    if (stat.isFile()) {
      return !this.#repo.index.trackedFile(pathname);
    }
    if (!stat.isDirectory()) {
      return false;
    }

    const entries = await this.#repo.workspace.listDir(pathname);

    const files = Object.entries(entries).filter(([p, stat]) => stat.isFile());
    const dirs = Object.entries(entries).filter(([p, stat]) => stat.isDirectory());

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

  async compareIndexToWorkspace(
    entry: Index.Entry | null,
    stat: Stats | null
  ): Promise<WorkspaceStatus> {
    if (entry === null) {
      return "untracked";
    }

    if (stat === null) {
      return "deleted";
    }

    if (!entry.statMatch(stat)) {
      return "modified";
    }

    if (entry.timesMatch(stat)) {
      return null;
    }

    const data = await this.#repo.workspace.readFile(entry.name);
    const blob = new Database.Blob(data);
    const oid = this.#repo.database.hashObject(blob);

    if (entry.oid !== oid) {
      return "modified";
    }

    return null;
  }

  compareTreeToIndex(dbEntry: Database.Entry | null, entry: Index.Entry | null): IndexStatus {
    if (dbEntry === null && entry === null) {
      return null;
    }

    if (dbEntry === null) {
      return "added";
    }

    if (entry === null) {
      return "deleted";
    }

    if (entry.mode !== dbEntry.mode || entry.oid !== dbEntry.oid) {
      return "modified";
    }

    return null;
  }
}
