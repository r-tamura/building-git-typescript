import { type Spec } from "@kit/core/util/arg";
import { BaseCommand } from ".";
import { Commit } from "@kit/core/database";
import * as Merge from "@kit/core/merge";
import type { PendingCommit } from "@kit/core/repository/pending_commit";
import { Sequencer } from "@kit/core/repository/sequencer";
import { RevList } from "@kit/core/rev_list";
import { HEAD } from "@kit/core/revision";
import type { CompleteCommit } from "@kit/core/types";
import { asserts } from "@kit/core/util/assert";
import { reverse } from "@kit/core/util/asynciter";
import * as Sequencing from "./shared/sequencing.js";
import { currentAuthor, writeTree } from "./shared/write_commit.js";

export class CherryPick extends BaseCommand<Sequencing.Options> {
  pendingCommit!: PendingCommit;
  #sequencer!: Sequencer;
  async run() {
    await Sequencing.run(this);
  }

  defineSpec(): Spec {
    return Sequencing.defineSpec(this);
  }

  initOptions() {
    this.options = {
      ...Sequencing.initOptions(),
    };
  }

  async storeCommitSequence() {
    const commits = await RevList.fromRevs(this.repo, this.args.reverse(), {
      walk: false,
    });
    for await (const commit of reverse(commits)) {
      this.sequencer.pick(commit);
    }
  }

  get sequencer() {
    return (this.#sequencer ??= new Sequencer(this.repo, {
      fs: this.repo.env.fs,
    }));
  }

  get mergeType(): "cherry_pick" {
    return "cherry_pick";
  }

  async pick(commit: CompleteCommit) {
    const inputs = await this.pickMergeInputs(commit);

    await Sequencing.resolveMerge(inputs, this);

    if (this.repo.index.conflict()) {
      await Sequencing.failOnConflict(inputs, commit.message, this);
    }

    const tree = await writeTree(this);
    const picked = new Commit(
      [inputs.leftOid],
      tree.oid,
      commit.author,
      await currentAuthor(this),
      commit.message,
    );

    await Sequencing.finishCommit(picked, this);
  }

  private async pickMergeInputs(commit: CompleteCommit) {
    const short = this.repo.database.shortOid(commit.oid);
    const parent = await Sequencing.selectParent(commit, this);
    const leftName = HEAD;
    const leftOid = await this.repo.refs.readHead();
    asserts(leftOid !== null, "HEADが存在する必要がある");
    // Note: ...の後ろにスペースがあるのはgitの挙動? jitのソース・テストはスペースあり
    const rightName = `${short}... ${commit.titleLine()}`;
    const rightOid = commit.oid;

    return new Merge.CherryPick(leftName, rightName, leftOid, rightOid, [
      parent,
    ]);
  }
}
