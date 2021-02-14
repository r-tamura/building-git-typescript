import path = require("path");
import * as Database from "./database";
import { PathFilter } from "./path_filter";
import { SymRef } from "./refs";
import { Repository } from "./repository";
import { COMMIT, HEAD, InvalidObject, Revision } from "./revision";
import { CompleteCommit, OID, Pathname } from "./types";
import {
  asserts,
  clone,
  compact,
  first,
  found,
  insert,
  isempty,
  last,
} from "./util";

type Flag = "seen" | "added" | "uninteresting" | "treesame";
const RANGE = /^(.*)\.\.(.*)$/;
const EXCLUDE = /^\^(.+)$/;

type OidPair = [OID | null, OID | null];

type EntryPathPair = [CompleteCommit, undefined] | [Database.Entry, Pathname];

export interface Options {
  walk: boolean;
  /** コミットのみでなく、全てのオブジェクトも探索対象に含めるか */
  objects: boolean;
  /** 全てのコミットを含めるか */
  all: boolean;
  /** ローカルブランチを含めるか */
  branches: boolean;
  /** リモートブランチを含めるか */
  remotes: boolean;
  /** 存在しないrevisionが指定された場合にエラーを無視する */
  missing: boolean;
}
export class RevList {
  #repo: Repository;
  #commits: Map<OID, CompleteCommit> = new Map();
  #flags: Map<OID, Set<Flag>> = new Map();
  #queue: CompleteCommit[] = [];
  #output: CompleteCommit[] = [];
  #limited = false;
  #prune: Pathname[] = [];
  #filter!: PathFilter;
  #diffs: Map<OidPair, Database.Changes> = new Map();
  #walk: boolean;
  #objects: boolean;
  #missing: boolean;
  #pending: Database.Entry[] = [];
  #path: Record<OID, Pathname> = {};
  private constructor(repo: Repository, { walk, objects, missing }: Options) {
    this.#repo = repo;
    this.#walk = walk;
    this.#objects = objects;
    this.#missing = missing;
  }

  static async fromRevs(
    repo: Repository,
    revs: string[],
    {
      walk = true,
      objects = false,
      all = false,
      missing = false,
      branches = false,
      remotes = false,
    }: Partial<Options> = {},
  ): Promise<RevList> {
    const list = new this(repo, {
      walk,
      objects,
      all,
      missing,
      branches,
      remotes,
    });

    if (all) {
      await list.includeRefs(await list.#repo.refs.listAllRefs());
    }
    if (branches) {
      await list.includeRefs(await list.#repo.refs.listBranches());
    }
    if (branches) {
      await list.includeRefs(await list.#repo.refs.listRemotes());
    }

    for (const rev of revs) {
      await list.handleRevision(rev);
    }
    if (isempty(list.#queue)) {
      await list.handleRevision(HEAD);
    }
    list.#filter = PathFilter.build(list.#prune);
    return list;
  }

  async treediff(oldOid: OID | null, newOid: OID | null) {
    // TODO: JSのMapのキーは参照一致の場合に同値とみなされるので、キャッシュがヒットしない
    const key: OidPair = [oldOid, newOid];
    const diff = this.#diffs.get(key);
    if (diff) {
      return diff;
    }
    const changes = await this.#repo.database.treeDiff(
      oldOid,
      newOid,
      this.#filter,
    );
    this.#diffs.set(key, changes);
    return changes;
  }

  async *each(): AsyncGenerator<CompleteCommit> {
    if (this.#limited) {
      await this.limitList();
    }
    if (this.#objects) {
      await this.markEdgesUninteresting();
    }
    yield* this.traverseCommits();
  }

  /**
   * コミット・オブジェクトを出力します
   * コンストラクタのobjectsがfalseの場合はeachと同等で
   */
  async *eachWithObjects(): AsyncGenerator<EntryPathPair> {
    for await (const commit of this) {
      yield [commit, undefined];
    }
    for await (const object of this.traversePending()) {
      yield [object, this.#path[object.oid]];
    }
  }

  private async addParents(commit: CompleteCommit) {
    if (!this.#walk || !this.mark(commit.oid, "added")) {
      return;
    }

    let parents: CompleteCommit[];
    if (this.marked(commit.oid, "uninteresting")) {
      // prettier-ignore
      parents = await Promise.all(commit.parents.map((oid) => this.loadCommit(oid)));
      parents.forEach((parent) => this.markParentsUninteresting(parent));
    } else {
      const parentOids = await this.simplifyCommit(commit);
      // prettier-ignore
      parents = await Promise.all(parentOids.map((oid) => this.loadCommit(oid)));
    }
    parents.forEach((parent) => this.enqueueCommit(parent));
  }

  private enqueueCommit(commit: CompleteCommit) {
    if (!this.mark(commit.oid, "seen")) {
      return;
    }

    if (this.#walk) {
      const index = this.#queue.findIndex((c) => c.date < commit.date);
      this.#queue = insert(
        this.#queue,
        found(index) ? index : this.#queue.length,
        commit,
      );
    } else {
      this.#queue.push(commit);
    }
  }

  private async handleRevision(rev: string) {
    let match;
    if (await this.#repo.workspace.statFile(rev)) {
      // ファイル/ディレクトリ名は別扱い
      this.#prune.push(rev);
    } else if ((match = RANGE.exec(rev))) {
      // rev1..rev2 のとき rev1 から見たrev2までの差分を出力
      const [_, rev1, rev2] = match;
      await this.setStartpoint(rev1, false);
      await this.setStartpoint(rev2, true);
      this.#walk = true;
    } else if ((match = EXCLUDE.exec(rev))) {
      await this.setStartpoint(match[1], false);
      this.#walk = true;
    } else {
      await this.setStartpoint(rev, true);
    }
  }

  private async loadCommit(oid: OID) {
    if (!this.#commits.has(oid)) {
      const commit = await this.#repo.database.load(oid);
      asserts(commit.type === "commit");
      this.#commits.set(oid, commit);
    }
    const commit = this.#commits.get(oid);
    asserts(typeof commit !== "undefined");
    return commit;
  }

  private mark(oid: OID, flag: Flag): boolean {
    if (!this.#flags.has(oid)) {
      this.#flags.set(oid, new Set());
    }
    const flags = this.#flags.get(oid);
    asserts(typeof flags !== "undefined");
    if (flags.has(flag)) {
      return false;
    }
    flags.add(flag);
    return true;
  }

  private marked(oid: OID, flag: Flag) {
    return !!this.#flags.get(oid)?.has?.(flag);
  }

  private markParentsUninteresting(commit: CompleteCommit) {
    const queue = clone(commit.parents);
    while (!isempty(queue)) {
      // コミットキューが空でないことが保証されている
      const oid = queue.shift() as OID;
      if (!this.mark(oid, "uninteresting")) {
        continue;
      }
      const _commit = this.#commits.get(oid);
      if (_commit) {
        queue.push(...commit.parents);
      }
    }
  }

  private async markEdgesUninteresting() {
    for (const commit of this.#queue) {
      if (this.marked(commit.oid, "uninteresting")) {
        await this.markTreeUninteresting(commit.tree);
      }

      for (const oid of commit.parents) {
        if (!this.marked(oid, "uninteresting")) {
          continue;
        }

        const parent = await this.loadCommit(oid);
        await this.markTreeUninteresting(parent.tree);
      }
    }
  }

  private async markTreeUninteresting(treeOid: OID) {
    const entry = this.#repo.database.treeEntry(treeOid);
    asserts(entry !== null);
    return this.traverseTree(entry, (object) =>
      this.mark(object.oid, "uninteresting"),
    );
  }

  private async setStartpoint(rev: string, interesting: boolean) {
    if (rev === "") {
      rev = HEAD;
    }
    try {
      const oid = await new Revision(this.#repo, rev).resolve(COMMIT);

      const commit = await this.loadCommit(oid);
      asserts(commit !== null, "valid commit");

      this.enqueueCommit(commit);
      if (!interesting) {
        this.#limited = true;
        this.mark(oid, "uninteresting");
        this.markParentsUninteresting(commit);
      }
    } catch (e: unknown) {
      if (e instanceof InvalidObject) {
        if (this.#missing) {
          return;
        }
        throw e;
      }
    }
  }

  private async limitList() {
    while (this.stillInteresting()) {
      // stillInterestingがtrueのとき、queueに一つ以上コミットがある
      const commit = this.#queue.shift()!;
      await this.addParents(commit);

      if (!this.marked(commit.oid, "uninteresting")) {
        this.#output.push(commit);
      }
    }
    this.#queue = this.#output;
  }

  private stillInteresting() {
    if (isempty(this.#queue)) {
      return;
    }

    const oldest_out = last(this.#output);
    const newest_in = first(this.#queue);

    if (oldest_out && oldest_out.date <= newest_in.date) {
      return true;
    }
    if (
      this.#queue.some((commit) => !this.marked(commit.oid, "uninteresting"))
    ) {
      return true;
    }
    return false;
  }

  /**
   * 親コミットと差分がない場合には、差分がないことを記録する
   * 現コミットへ採用された親コミットを発見した場合、その親コミットのみを返す。発見できなかった場合は全ての親コミットを返す。
   * @param commit
   */
  private async simplifyCommit(commit: CompleteCommit) {
    if (isempty(this.#prune)) {
      return commit.parents;
    }

    const parents = isempty(commit.parents) ? [null] : commit.parents;

    for (const oid of parents) {
      const diff = await this.treediff(oid, commit.oid);
      if (diff.size !== 0) {
        continue;
      }
      this.mark(commit.oid, "treesame");
      // rubyの[*oid]相当
      return oid ? [oid] : [];
    }
    return commit.parents;
  }

  private async *traverseCommits() {
    while (!isempty(this.#queue)) {
      // コミットキューが空でないことが保証されている
      const commit = this.#queue.shift()!;
      if (!this.#limited) {
        await this.addParents(commit);
      }

      if (this.marked(commit.oid, "uninteresting")) {
        continue;
      }
      if (this.marked(commit.oid, "treesame")) {
        continue;
      }

      this.#pending.push(this.#repo.database.treeEntry(commit.tree));
      yield commit;
    }
  }

  private async *traverseTree(
    entry: Database.Entry,
    isInteresting: (entry: Database.Entry) => boolean,
    pathname = "",
  ): AsyncGenerator<Database.Entry, void, void> {
    this.#path[entry.oid] ??= pathname;

    if (!isInteresting(entry)) {
      return;
    }
    yield entry;
    if (!entry.tree()) {
      return;
    }
    const tree = await this.#repo.database.load(entry.oid);
    asserts(tree.type === "tree");

    for (const [name, item] of Object.entries(tree.entries)) {
      // databaseから読み込まれたtreeオブジェクトのエントリ
      asserts(item.type === "database");
      yield* this.traverseTree(
        item,
        (object) => {
          return Boolean(object);
        },
        path.join(pathname, name),
      );
    }
  }

  private async *traversePending(): AsyncGenerator<Database.Entry, void, void> {
    if (!this.#objects) {
      return;
    }

    for (const entry of this.#pending) {
      yield* this.traverseTree(entry, (object) => {
        if (this.marked(object.oid, "uninteresting")) {
          return false;
        }

        if (!this.mark(object.oid, "seen")) {
          return false;
        }

        return Boolean(object);
      });
    }
  }

  private async includeRefs(refs: SymRef[]) {
    const oids = compact(await Promise.all(refs.map((ref) => ref.readOid())));
    return await Promise.all(oids.map((oid) => this.handleRevision(oid)));
  }

  [Symbol.asyncIterator]() {
    return this.each();
  }
}
