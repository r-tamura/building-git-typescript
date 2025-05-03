import * as arg from "arg";
import { Commit } from "../database";
import { CherryPick } from "../merge";
import { MergeType, PendingCommit } from "../repository/pending_commit";
import { Sequencer } from "../repository/sequencer";
import { RevList } from "../rev_list";
import { HEAD } from "../revision";
import { CompleteCommit, Nullable } from "../types";
import { stripIndent } from "../util";
import { asserts } from "../util/assert";
import { BaseCommand } from "./base";
import { COMMIT_NOTES } from "./commit";
import * as Sequencing from "./shared/sequencing";
import {
    commitMessagePath,
    currentAuthor,
    writeTree,
} from "./shared/write_commit";

export class Revert extends BaseCommand<Sequencing.Options> {
  pendingCommit!: PendingCommit;
  #sequencer!: Sequencer;
  async run() {
    await Sequencing.run(this);
  }

  async storeCommitSequence() {
    const commits = await RevList.fromRevs(this.repo, this.args, {
      walk: false,
    });
    for await (const commit of commits) {
      this.sequencer.revert(commit);
    }
  }

  defineSpec(): arg.Spec {
    return Sequencing.defineSpec(this);
  }

  initOptions() {
    this.options = Sequencing.initOptions();
  }

  async revert(commit: CompleteCommit) {
    const inputs = await this.revertMergeInputs(commit);
    let message: Nullable<string> = this.revertCommitMessage(commit);

    await Sequencing.resolveMerge(inputs, this);
    if (this.repo.index.conflict()) {
      await Sequencing.failOnConflict(inputs, message, this);
    }

    const author = await currentAuthor(this);
    message = await this.editRevertMessage(message);
    asserts(message !== null);
    const tree = await writeTree(this);
    const picked = new Commit(
      [inputs.leftOid],
      tree.oid,
      author,
      author,
      message,
    );
    await Sequencing.finishCommit(picked, this);
  }

  get mergeType(): MergeType {
    return "revert";
  }

  get sequencer() {
    return (this.#sequencer ??= new Sequencer(this.repo));
  }

  private async revertMergeInputs(commit: CompleteCommit) {
    const short = this.repo.database.shortOid(commit.oid);
    const leftName = HEAD;
    const leftOid = await this.repo.refs.readHead();
    asserts(leftOid !== null, "HEADが存在する必要がある");
    const rightName = `parent of ${short}... ${commit.titleLine()}`;
    const rightOid = await Sequencing.selectParent(commit, this);

    return new CherryPick(leftName, rightName, leftOid, rightOid, [commit.oid]);
  }

  private revertCommitMessage(commit: CompleteCommit) {
    return stripIndent`
      Revert "${commit.titleLine()}"

      This reverts commit ${commit.oid}
    `;
  }

  private async editRevertMessage(message: string) {
    return this.editFile(commitMessagePath(this), async (editor) => {
      await editor.puts(message);
      await editor.puts("");
      await editor.note(COMMIT_NOTES);
    });
  }
}
