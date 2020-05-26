import { Repository } from "./repository";
import { Revision, HEAD, COMMIT } from "./revision";
import { asserts, found, insert, isempty } from "./util";
import { OID, CompleteCommit } from "./types";

type Flag = "seen" | "added";
export class RevList {
  #repo: Repository;
  #commits: Map<OID, CompleteCommit> = new Map();
  #flags: Map<OID, Set<Flag>> = new Map();
  #queue: CompleteCommit[] = [];
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
    yield* this.traverseCommits();
  }

  private async addParents(commit: CompleteCommit) {
    if (!this.mark(commit.oid, "added")) {
      return;
    }
    const parent = await this.loadCommit(commit.parent);
    if (parent) {
      this.enqueueCommit(parent);
    }
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
    const oid = await new Revision(this.#repo, rev).resolve(COMMIT);

    const commit = await this.loadCommit(oid);
    asserts(commit !== null);
    this.enqueueCommit(commit);
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

  private async *traverseCommits() {
    while (!isempty(this.#queue)) {
      const commit = this.#queue.shift();
      asserts(typeof commit !== "undefined");
      await this.addParents(commit);
      yield commit;
    }
  }
}
