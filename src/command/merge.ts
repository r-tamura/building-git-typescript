import { Base } from "./base";
import { writeCommit } from "./shared/write_commit";
import { HEAD } from "../revision";
import { readTextStream } from "../services";
import { Inputs, Resolve } from "../merge";

export class Merge extends Base {
  #inputs!: Inputs;

  async run() {
    this.#inputs = await Inputs.of(this.repo, HEAD, this.args[0]);

    if (this.#inputs.alreadyMerged()) {
      this.handleMergedAncestor();
    }

    if (this.#inputs.fastForward()) {
      await this.handleFastForward();
    }

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

  private handleMergedAncestor(): never {
    this.log("Already up to date.");
    this.exit(0);
  }

  private async handleFastForward() {
    const a = this.repo.database.shortOid(this.#inputs.leftOid);
    const b = this.repo.database.shortOid(this.#inputs.rightOid);

    this.log(`Updating ${a}..${b}`);
    this.log("Fast-Forward");

    await this.repo.index.loadForUpdate();

    const treeDiff = await this.repo.database.treeDiff(
      this.#inputs.leftOid,
      this.#inputs.rightOid
    );
    await this.repo.migration(treeDiff).applyChanges();

    await this.repo.index.writeUpdates();

    await this.repo.refs.updateHead(this.#inputs.rightOid);
    this.exit(0);
  }
}
