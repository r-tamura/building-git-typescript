import { Repository } from "./repository";
import { Revision, HEAD, COMMIT } from "./revision";
import { asserts } from "./util";

export class RevList {
  #repo: Repository;
  #start: string;
  constructor(repo: Repository, start?: string) {
    this.#repo = repo;
    this.#start = start ?? HEAD;
  }

  async *each() {
    let oid = await new Revision(this.#repo, this.#start).resolve(COMMIT);

    while (oid) {
      const commit = await this.#repo.database.load(oid);
      asserts(commit.type === "commit");
      yield commit;
      oid = commit.parent;
    }
  }
}
