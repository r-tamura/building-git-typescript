import { Database } from "../database";
import { OID, CompleteCommit } from "../types";
import { insert, asserts, Hash, superset, merge } from "../util";

/**
 * result: BCAの候補となったときセットされる
 * stale: resultフラグを持つコミットの親コミットにセットされる
 */
type Flag = "parent1" | "parent2" | "stale" | "result";

const BOTH_PARENTS = new Set<Flag>(["parent1", "parent2"]);

type FlagSet = Set<Flag>;
type FlagMap = Hash<OID, FlagSet>;
export class CommonAncestors {
  #database: Database;
  #flags: FlagMap = new Hash((hash, oid) => hash.set(oid, new Set()));
  #queue: CompleteCommit[] = [];
  #results: CompleteCommit[] = [];
  private constructor(database: Database) {
    this.#database = database;
  }

  static async of(database: Database, one: OID, twos: OID[]) {
    const self = new CommonAncestors(database);
    const commitOne = await database.load(one);
    asserts(commitOne.type === "commit");

    self.#queue = insertByDate(self.#queue, commitOne);
    self.#flags.get(one).add("parent1");

    for (const two of twos) {
      const commitTwo = await database.load(two);
      asserts(commitTwo.type === "commit");
      self.#queue = insertByDate(self.#queue, commitTwo);
      self.#flags.get(two).add("parent2");
    }
    return self;
  }

  /**
   * BCAを探索する
   */
  async find(): Promise<OID[]> {
    // queueが空になるまで
    // 1. ququeから取り出す
    // 2. flagを調べる
    while (!this.allStale()) {
      // 空ではないので、undefinedにはならない
      this.processQueue();
    }
    // "stale"でないコミットIDのみのリストを返す
    return this.#results
      .map((c) => c.oid)
      .filter((oid) => !this.marked(oid, "stale"));
  }

  marked(oid: OID, flag: Flag) {
    return this.#flags.get(oid).has(flag);
  }

  /**
   * あるコミットの親コミットを全て処理キューへ追加する
   * @param commit
   * @param flags 親コミットへ付加されるフラグ
   */
  private async addParents(commit: CompleteCommit, flags: FlagSet) {
    if (!commit.parent) {
      return;
    }
    // const parents = commit.parents.map(this.#database.load);
    for (const parentOid of commit.parents) {
      const parent = await this.#database.load(parentOid);
      // あるcommitのparentはcommit
      asserts(parent.type === "commit");
      // 既に他のルートからparentとして登録されている場合は無視する
      if (superset(this.#flags.get(parent.oid), flags)) {
        continue;
      }
      this.#flags.set(parent.oid, merge(this.#flags.get(parent.oid), flags));
      this.#queue = insertByDate(this.#queue, parent);
    }
  }

  private allStale() {
    return this.#queue.every((commit) => this.marked(commit.oid, "stale"));
  }

  private async processQueue() {
    const commit = this.#queue.shift() as CompleteCommit;
    const flags = this.#flags.get(commit.oid);
    if (isEquallSet(flags, BOTH_PARENTS)) {
      flags.add("result");
      this.#results = insertByDate(this.#results, commit);
      await this.addParents(commit, new Set([...flags, "stale"]));
    } else {
      await this.addParents(commit, flags);
    }
  }
}

function insertByDate(list: CompleteCommit[], commit: CompleteCommit) {
  const index = list.findIndex((c) => c.date < commit.date);
  return insert(list, index === -1 ? list.length : index, commit);
}

/*
 * 2つのSetが全て同じ値を持つかを判定します。
 */
function isEquallSet<T>(s1: Set<T>, s2: Set<T>) {
  for (const value of s1.values()) {
    if (!s2.has(value)) {
      return false;
    }
  }
  return true;
}
