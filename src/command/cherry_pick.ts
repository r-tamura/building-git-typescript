import { Base } from ".";
import { Resolvable, Resolve } from "../merge";
import { HEAD, Revision } from "../revision";
import { CompleteCommit } from "../types";
import { currentAuthor, printCommit, writeTree } from "./shared/write_commit";
import * as Merge from "../merge";
import { asserts, assertsComplete } from "../util";
import { Commit } from "../database";

export class CherryPick extends Base {
  async run() {
    const revision = new Revision(this.repo, this.args[0]);
    // リビジョンから解決されたOIDはコミットであるため
    const commit = (await this.repo.database.load(await revision.resolve())) as CompleteCommit;
    await this.pick(commit);
  }

  private async pick(commit: CompleteCommit) {
    const inputs = await this.pickMergeInputs(commit);

    await this.resolveMerge(inputs);

    const tree = await writeTree(this);
    const picked = new Commit(
      [inputs.leftOid],
      tree.oid,
      commit.author,
      currentAuthor(this),
      commit.message
    );

    await this.finishCommit(picked);
  }

  private async pickMergeInputs(commit: CompleteCommit) {
    const short = this.repo.database.shortOid(commit.oid);
    const leftName = HEAD;
    const leftOid = await this.repo.refs.readHead();
    asserts(leftOid !== null, "HEADが存在する必要がある");
    const rightName = `${short}...${commit.titleLine()}`;
    const rightOid = commit.oid;

    return new Merge.CherryPick(leftName, rightName, leftOid, rightOid, [commit.parent]);
  }

  private async resolveMerge(inputs: Resolvable) {
    await this.repo.index.loadForUpdate();
    await new Resolve(this.repo, inputs).execute();
    await this.repo.index.writeUpdates();
  }

  private async finishCommit(commit: Commit) {
    await this.repo.database.store(commit);
    assertsComplete(commit, "objectsへ保存されたコミットはOIDを持つ");
    await this.repo.refs.updateHead(commit.oid);
    await printCommit(commit, this);
  }
}
