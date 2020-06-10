import { Database } from "../database";
import { OID, CompleteCommit } from "../types";
import {
  insert,
  asserts,
  isempty,
  BaseError,
  Hash,
  superset,
  merge,
} from "../util";

type Flag = "parent1" | "parent2";

const BOTH_PARENTS = new Set<Flag>(["parent1", "parent2"]);

type FlagSet = Set<Flag>;
type FlagMap = Hash<OID, FlagSet>;
export class CommonAncestors {
  #database: Database;
  #flags: FlagMap = new Hash((hash, oid) => hash.set(oid, new Set()));
  #queue: CompleteCommit[] = [];
  private constructor(database: Database) {
    this.#database = database;
  }

  static async of(database: Database, one: OID, two: OID) {
    const ca = new CommonAncestors(database);
    const commitOne = await database.load(one);
    asserts(commitOne.type === "commit");

    ca.#queue = insertByDate(ca.#queue, commitOne);
    ca.#flags.get(one).add("parent1");

    const commitTwo = await database.load(two);
    asserts(commitTwo.type === "commit");
    ca.#queue = insertByDate(ca.#queue, commitTwo);
    ca.#flags.get(two).add("parent2");
    return ca;
  }

  /**
   * BCAを探索する
   */
  async find(): Promise<OID> {
    // queueが空になるまで
    // 1. ququeから取り出す
    // 2. flagを調べる
    while (!isempty(this.#queue)) {
      // 空ではないので、undefinedにはならない
      const commit = this.#queue.shift() as CompleteCommit;
      const flags = this.#flags.get(commit.oid);
      if (isEquallSet(flags, BOTH_PARENTS)) {
        return commit.oid;
      }
    }
    throw new BaseError("has no Common Ancestor");
  }

  private async addParents(commit: CompleteCommit, flags: FlagSet) {
    if (!commit.parent) {
      return;
    }
    // あるcommitのparentはcommit
    const parent = (await this.#database.load(commit.parent)) as CompleteCommit;
    // 既に他のルートからparentとして登録されている場合は無視する(?)
    if (superset(this.#flags.get(parent.oid), flags)) {
      return;
    }
    this.#flags.set(parent.oid, merge(this.#flags.get(parent.oid), flags));
    this.#queue = insertByDate(this.#queue, parent);
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
