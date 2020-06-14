import { Base } from "./base";
import { writeCommit } from "./shared/write_commit";
import { HEAD } from "../revision";
import { readTextStream } from "../services";
import { Inputs, Resolve } from "../merge";

export class Merge extends Base {
  #inputs!: Inputs;

  async run() {
    this.#inputs = await Inputs.of(this.repo, HEAD, this.args[0]);
    await this.resolveMerge();
    await this.commitMerge();
  }

  async resolveMerge() {
    await this.repo.index.loadForUpdate();

    const merge = new Resolve(this.repo, this.#inputs);
    await merge.execute();

    await this.repo.index.writeUpdates();
  }

  async commitMerge() {
    const parents = [this.#inputs.leftOid, this.#inputs.rightOid];
    const message = await readTextStream(this.env.process.stdin);
    await writeCommit(parents, message, this);
  }
}
