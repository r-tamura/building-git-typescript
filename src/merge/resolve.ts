import { Repository } from "~/repository";
import { Inputs } from "./inputs";

export class Resolve {
  #repo: Repository;
  #inputs: Inputs;
  constructor(repo: Repository, inputs: Inputs) {
    this.#repo = repo;
    this.#inputs = inputs;
  }

  async execute() {
    const baseOid = this.#inputs.baseOids[0];
    const treeDiff = await this.#repo.database.treeDiff(
      baseOid,
      this.#inputs.rightOid
    );
    const migration = this.#repo.migration(treeDiff);
    await migration.applyChanges();
  }
}
