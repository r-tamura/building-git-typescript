import { Repository } from "./repository";
import { Revision, HEAD, COMMIT } from "./revision";
import { asserts, found, insert, isempty, first, last, clone } from "./util";
import { OID, CompleteCommit, Pathname } from "./types";
import { PathFilter } from "./path_filter";
import { Changes } from "./database";

type Flag = "seen" | "added" | "uninteresting" | "treesame";
const RANGE = /^(.*)\.\.(.*)$/;
const EXCLUDE = /^\^(.+)$/;

type OidPair = [OID | null, OID | null];
export class RevList {
  #repo: Repository;
  #commits: Map<OID, CompleteCommit> = new Map();
  #flags: Map<OID, Set<Flag>> = new Map();
  #queue: CompleteCommit[] = [];
  #output: CompleteCommit[] = [];
  #limited = false;
  #prune: Pathname[] = [];
  #filter!: PathFilter;
  #diffs: Map<OidPair, Changes> = new Map();
  private constructor(repo: Repository) {
    this.#repo = repo;
  }

  static async fromRevs(repo: Repository, revs: string[]): Promise<RevList> {
    const list = new this(repo);
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
    const changes = await this.#repo.database.treeDiff(oldOid, newOid, this.#filter);
    this.#diffs.set(key, changes);
    return changes;
  }

  async *each(): AsyncGenerator<CompleteCommit> {
    if (this.#limited) {
      await this.limitList();
    }
    yield* this.traverseCommits();
  }

  private async addParents(commit: CompleteCommit) {
    if (!this.mark(commit.oid, "added")) {
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

    const index = this.#queue.findIndex((c) => c.date < commit.date);

    this.#queue = insert(this.#queue, found(index) ? index : this.#queue.length, commit);
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
    } else if ((match = EXCLUDE.exec(rev))) {
      await this.setStartpoint(match[1], false);
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

  private mark(oid: OID, flag: Flag) {
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
      const oid = queue.shift()!;
      if (!this.mark(oid, "uninteresting")) {
        continue;
      }
      const _commit = this.#commits.get(oid);
      if (_commit) {
        queue.push(...commit.parents);
      }
    }
  }

  private async setStartpoint(rev: string, interesting: boolean) {
    if (rev === "") {
      rev = HEAD;
    }
    const oid = await new Revision(this.#repo, rev).resolve(COMMIT);

    const commit = await this.loadCommit(oid);
    asserts(commit !== null, "valid commit");

    this.enqueueCommit(commit);
    if (!interesting) {
      this.#limited = true;
      this.mark(oid, "uninteresting");
      this.markParentsUninteresting(commit);
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
    if (this.#queue.some((commit) => !this.marked(commit.oid, "uninteresting"))) {
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

      yield commit;
    }
  }
}
