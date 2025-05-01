import * as arg from "arg";
import { Inputs, Resolve } from "../merge";
import {
  Error as NotInProgressError,
  PendingCommit,
} from "../repository/pending_commit";
import { HEAD } from "../revision";
import { asserts } from "../util";
import { Base } from "./base";
import {
  CommitOptions,
  CONFLICT_MESSAGE,
  defineWriteCommitOptions,
  pendingCommit,
  readMessage,
  resumeMerge,
  writeCommit,
} from "./shared/write_commit";

interface Options extends CommitOptions {
  mode: "run" | "continue" | "abort";
}

const COMMIT_NOTES = `
  Please enter a commit message to explain why this merge is necessary,
  especially if it merges an updated upstream into a topic branch.

  Lines starting with '#' will be ignored, and an empty message aborts
  the commit.
`;
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
    await pendingCommit(this).start(this.#inputs.rightOid);
    await this.resolveMerge();
    await this.commitMerge();
  }

  protected defineSpec(): arg.Spec {
    return {
      "--continue": arg.flag(() => {
        this.options["mode"] = "continue";
      }),
      "--abort": arg.flag(() => {
        this.options["mode"] = "abort";
      }),
      ...defineWriteCommitOptions(this),
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
      await this.failOnConflict();
    }
  }

  async commitMerge() {
    const parents = [this.#inputs.leftOid, this.#inputs.rightOid];
    const message = await this.composeMerge();
    await writeCommit(parents, message, this);

    await this.pendingCommit.clear();
  }

  private async composeMerge() {
    return this.editFile(this.pendingCommit.messagePath, async (editor) => {
      await editor.puts(
        (await readMessage(this)) ?? this.defaultCommitMessage(),
      );
      await editor.puts("");
      await editor.note(COMMIT_NOTES);
      if (!this.options["edit"]) {
        editor.close();
      }
    });
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
      this.#inputs.rightOid,
    );
    await this.repo.migration(treeDiff).applyChanges();

    await this.repo.index.writeUpdates();

    await this.repo.refs.updateHead(this.#inputs.rightOid);
    this.exit(0);
  }

  private async handleContinue() {
    try {
      await this.repo.index.load();
      await resumeMerge("merge", this);
    } catch (e) {
      asserts(e instanceof Error, "unknown error");
      switch (e.constructor) {
        case NotInProgressError:
          this.logger.error(`fatal: ${e.message}`);
          this.exit(128);
          break;
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
      asserts(e instanceof Error, "unknown error");
      switch (e.constructor) {
        case NotInProgressError:
          this.logger.error(`fatal: ${e.message}`);
          this.exit(128);
          break;
        default:
          throw e;
      }
    }
  }

  private async failOnConflict() {
    await this.editFile(this.pendingCommit.messagePath, async (editor) => {
      await editor.puts(
        (await readMessage(this)) ?? this.defaultCommitMessage(),
      );
      await editor.puts("");
      await editor.note("Conflicts:");
      for (const name of this.repo.index.conflictPaths()) {
        await editor.note(`\t${name}`);
      }
      editor.close();
    });
    this.log(
      "Automatic merge failed; fix conflicts and then commit the result.",
    );
    this.exit(1);
  }

  private defaultCommitMessage() {
    return `Merge commit '${this.#inputs.rightName}'`;
  }
}
