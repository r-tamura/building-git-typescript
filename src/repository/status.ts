import { Stats } from "fs";
import * as path from "path";
import * as Database from "../database";
import * as Index from "../gindex";
import { Stage } from "../gindex";
import { Dict, OID, Pathname } from "../types";
import { IndexStatus, Inspector, WorkspaceStatus } from "./inspector";
import { Repository } from "./repository";

export type ChangeType = IndexStatus | WorkspaceStatus;
export type ConflictStatus = Stage[];
export class Status {
  changed: Set<Pathname> = new Set();
  indexChanges: Map<Pathname, IndexStatus> = new SortedMap();
  workspaceChanges: Map<Pathname, WorkspaceStatus> = new SortedMap();
  untrackedFiles: Set<Pathname> = new Set();
  conflicts: Map<Pathname, ConflictStatus> = new SortedMap();

  headTree: Dict<Database.Entry> = {};
  stats: Dict<Stats> = {};

  #inspector: Inspector;

  private constructor(public repo: Repository) {
    this.#inspector = new Inspector(repo);
  }

  static async of(repo: Repository, commitOid: OID | null = null) {
    const self = new this(repo);

    commitOid ??= await self.repo.refs.readHead();
    self.headTree = await self.repo.database.loadTreeList(commitOid);

    await self.scanWorkspace();
    await self.checkIndexEntries();
    self.collectDeletedHeadFiles();
    return self;
  }
  async checkIndexEntries() {
    for (const entry of this.repo.index.eachEntry()) {
      if (entry.stage === 0) {
        // コンフリクトなし
        await this.checkIndexAgainstWorkspace(entry);
        this.checkIndexAgainstHeadTree(entry);
      } else {
        // コンフリクトあり
        this.changed.add(entry.name);
        if (!this.conflicts.has(entry.name)) {
          this.conflicts.set(entry.name, []);
        }
        // パスに対応した要素がない場合は, 上記で初期化されるので値が存在することが保証される
        this.conflicts.get(entry.name)!.push(entry.stage);
      }
    }
  }
  collectDeletedHeadFiles() {
    Object.keys(this.headTree).forEach((name) => {
      if (!this.repo.index.trackedFile(name)) {
        this.recordChange(name, this.indexChanges, "deleted");
      }
    });
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
      } else if (await this.#inspector.trackableFile(pathname, stat)) {
        const outputName = stat.isDirectory() ? pathname + path.sep : pathname;
        this.untrackedFiles.add(outputName);
      }
    }
  }

  private checkIndexAgainstHeadTree(entry: Index.Entry) {
    const item = this.headTree[entry.name] ?? null;
    const status = this.#inspector.compareTreeToIndex(item, entry);

    if (status) {
      this.recordChange(entry.name, this.indexChanges, status);
    }
  }

  private async checkIndexAgainstWorkspace(entry: Index.Entry) {
    const stat = this.stats[entry.name] ?? null;
    const status = await this.#inspector.compareIndexToWorkspace(entry, stat);

    if (status) {
      this.recordChange(entry.name, this.workspaceChanges, status);
    } else {
      // コンテンツ内容に変更がないとき、index上のstat情報をworkspace上のファイルと同期する
      this.repo.index.updateEntryStat(entry, stat);
    }
  }

  private recordChange<T>(pathname: Pathname, set: Map<Pathname, T>, type: T) {
    this.changed.add(pathname);
    set.set(pathname, type);
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
