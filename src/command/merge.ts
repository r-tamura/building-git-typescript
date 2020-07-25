import * as arg from "arg";
import { Base } from "./base";
import { HEAD } from "../revision";
import { readTextStream } from "../services";
import { Inputs, Resolve } from "../merge";
import { writeCommit, pendingCommit, resumeMerge, CONFLICT_MESSAGE } from "./shared/write_commit";
import { PendingCommit, Error as NotInProgressError } from "../repository/pending_commit";
import { asserts } from "../util";

interface Options {
  mode: "run" | "continue" | "abort";
}

export class Merge extends Base<Options> {
  #inputs!: Inputs;

  pendingCommit!: PendingCommit;
  async run() {
    if (this.options["mode"] === "abort") {
      await this.handleAbort();
      return;
    }

    if (this.options["mode"] === "continue") {
      await this.handleContinue();
      return;
    }
    if (await pendingCommit(this).inProgress()) {
      this.handleInProgressMerge();
    }

    this.#inputs = await Inputs.of(this.repo, HEAD, this.args[0]);

    if (this.#inputs.alreadyMerged()) {
      this.handleMergedAncestor();
    }

    if (this.#inputs.fastForward()) {
      await this.handleFastForward();
    }
    const message = await readTextStream(this.env.process.stdin);
    await pendingCommit(this).start(this.#inputs.rightOid, message);
    await this.resolveMerge();
    await this.commitMerge();
  }

  protected defineSpec() {
    return {
      "--continue": arg.flag(() => {
        this.options["mode"] = "continue";
      }),
      "--abort": arg.flag(() => {
        this.options["mode"] = "abort";
      }),
    };
  }

  initOptions() {
    this.options = {
      mode: "run",
    };
  }

  async resolveMerge() {
    await this.repo.index.loadForUpdate();

    const merge = new Resolve(this.repo, this.#inputs);
    merge.onprogress = (info) => this.log(info);
    await merge.execute();

    await this.repo.index.writeUpdates();
    if (this.repo.index.conflict()) {
      this.log("Automatic merge failed; fix conflicts and then commit the result.");
      this.exit(1);
    }
  }

  async commitMerge() {
    const parents = [this.#inputs.leftOid, this.#inputs.rightOid];
    const message = await this.pendingCommit.mergeMessage();
    await writeCommit(parents, message, this);

    await this.pendingCommit.clear();
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

    const treeDiff = await this.repo.database.treeDiff(this.#inputs.leftOid, this.#inputs.rightOid);
    await this.repo.migration(treeDiff).applyChanges();

    await this.repo.index.writeUpdates();

    await this.repo.refs.updateHead(this.#inputs.rightOid);
    this.exit(0);
  }

  private async handleContinue() {
    try {
      await this.repo.index.load();
      await resumeMerge(this);
    } catch (e) {
      switch (e.constructor) {
        case NotInProgressError:
          this.logger.error(`fatal: ${e.message}`);
          this.exit(128);
        default:
          throw e;
      }
    }
  }

  private handleInProgressMerge() {
    const message = "Merging is not possible because you have unmerged files.";
    this.logger.error(`error: ${message}`);
    this.logger.error(CONFLICT_MESSAGE);
    return this.exit(128);
  }

  private async handleAbort() {
    try {
      await pendingCommit(this).clear();
      await this.repo.index.loadForUpdate();
      const headOid = await this.repo.refs.readHead();
      asserts(headOid !== null, "HEADが存在する必要があります。");
      await this.repo.hardReset(headOid);
      await this.repo.index.writeUpdates();
    } catch (e) {
      switch (e.constructor) {
        case NotInProgressError:
          this.logger.error(`fatal: ${e.message}`);
          this.exit(128);
        default:
          throw e;
      }
    }
  }
}
