import { Repository } from "./repository";
import { Revision, HEAD, COMMIT } from "./revision";
import { asserts, found, insert, isempty, first, last } from "./util";
import { OID, CompleteCommit } from "./types";

type Flag = "seen" | "added" | "uninteresting";
const RANGE = /^(.*)\.\.(.*)$/;
const EXCLUDE = /^\^(.+)$/;
export class RevList {
  #repo: Repository;
  #commits: Map<OID, CompleteCommit> = new Map();
  #flags: Map<OID, Set<Flag>> = new Map();
  #queue: CompleteCommit[] = [];
  #output: CompleteCommit[] = [];
  #limited: boolean = false;
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
    return list;
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
    const parent = await this.loadCommit(commit.parent);
    if (parent === null) {
      return;
    }

    if (this.marked(commit.oid, "uninteresting")) {
      this.markParentsUninteresting(parent);
    }

    this.enqueueCommit(parent);
  }

  private enqueueCommit(commit: CompleteCommit) {
    if (!this.mark(commit.oid, "seen")) {
      return;
    }

    const index = this.#queue.findIndex((c) => c.date < commit.date);

    this.#queue = insert(
      this.#queue,
      found(index) ? index : this.#queue.length,
      commit
    );
  }

  private async handleRevision(rev: string) {
    let match;
    if ((match = RANGE.exec(rev))) {
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

  private async loadCommit(oid: OID | null): Promise<CompleteCommit | null> {
    if (oid === null) {
      return null;
    }
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
    let c: CompleteCommit | null = commit;
    while (c?.parent) {
      if (!this.mark(commit.parent, "uninteresting")) {
        break;
      }
      c = this.#commits.get(commit.parent) ?? null;
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
      const commit = this.#queue.shift() as CompleteCommit;
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
      console.log("still");
      return true;
    }
    if (
      this.#queue.some((commit) => !this.marked(commit.oid, "uninteresting"))
    ) {
      return true;
    }
    return false;
  }

  private async *traverseCommits() {
    while (!isempty(this.#queue)) {
      const commit = this.#queue.shift() as CompleteCommit;
      if (!this.#limited) {
        await this.addParents(commit);
      }

      if (this.marked(commit.oid, "uninteresting")) {
        continue;
      }
      yield commit;
    }
  }
}
