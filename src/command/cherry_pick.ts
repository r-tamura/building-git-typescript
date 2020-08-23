import * as arg from "arg";
import { Base } from ".";
import { HEAD } from "../revision";
import { CompleteCommit } from "../types";
import {
  currentAuthor,
  writeTree,
} from "./shared/write_commit";
import * as Merge from "../merge";
import { Commit } from "../database";
import { RevList } from "../rev_list";
import { PendingCommit } from "../repository/pending_commit";
import { asserts } from "../util/assert";
import { reverse } from "../util/asynciter";
import { Sequencer } from "../repository/sequencer";
import * as Sequencing from "./shared/sequencing";

export class CherryPick extends Base<Sequencing.Options> {
  pendingCommit!: PendingCommit;
  #sequencer!: Sequencer;
  async run() {
    await Sequencing.run(this);
  }

  defineSpec(): arg.Spec {
    return Sequencing.defineSpec(this);
  }

  initOptions() {
    this.options = {
      ...Sequencing.initOptions()
    };
  }

  async storeCommitSequence() {
    const commits = await RevList.fromRevs(this.repo, this.args.reverse(), { walk: false });
    for await (const commit of reverse(commits)) {
      this.sequencer.pick(commit);
    }
  }

  get sequencer() {
    return this.#sequencer ??= new Sequencer(this.repo, { fs: this.repo.env.fs });
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
      commit.message
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

    return new Merge.CherryPick(leftName, rightName, leftOid, rightOid, [parent]);
  }
}
