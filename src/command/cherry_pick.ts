import * as arg from "arg";
import { Base } from ".";
import { Resolvable, Resolve } from "../merge";
import { HEAD } from "../revision";
import { CompleteCommit, Nullable } from "../types";
import {
  currentAuthor,
  pendingCommit,
  printCommit,
  writeCherryPickCommit,
  writeTree,
} from "./shared/write_commit";
import * as Merge from "../merge";
import { Commit } from "../database";
import { RevList } from "../rev_list";
import { PendingCommit, Error as PendingCommitError } from "../repository/pending_commit";
import { asserts, assertsComplete } from "../util/assert";
import { reverse } from "../util/asynciter";

interface Options {
  mode: Nullable<"continue">;
}

const CONFLICT_NOTES = `
  after resolving the conflicts, mark the corrected paths
  with 'kit add <paths>' or 'kit rm <paths>'
  and commit the result with 'kit commit'
`;

export class CherryPick extends Base<Options> {
  pendingCommit!: PendingCommit;
  async run() {
    if (this.options["mode"] === "continue") {
      await this.handleContinue();
    }

    // const revision = new Revision(this.repo, this.args[0]);
    // // リビジョンから解決されたOIDはコミットであるため
    // const commit = (await this.repo.database.load(await revision.resolve())) as CompleteCommit;
    // await this.pick(commit);

    const commits = await RevList.fromRevs(this.repo, this.args.reverse(), { walk: false });
    for await (const commit of reverse(commits)) {
      await this.pick(commit);
    }
  }

  defineSpec() {
    return {
      "--continue": arg.flag(() => {
        this.options["mode"] = "continue";
      }),
    };
  }

  initOptions() {
    this.options = {
      mode: null,
    };
  }

  private async pick(commit: CompleteCommit) {
    const inputs = await this.pickMergeInputs(commit);

    await this.resolveMerge(inputs);

    if (this.repo.index.conflict()) {
      await this.failOnConflict(inputs, commit.message);
    }

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
    // Note: ...の後ろにスペースがあるのはgitの挙動? jitのソース・テストはスペースあり
    const rightName = `${short}... ${commit.titleLine()}`;
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

  private async failOnConflict(inputs: Resolvable, message: string) {
    await pendingCommit(this).start(inputs.rightOid, this.mergeType());

    await this.editFile(pendingCommit(this).messagePath, async (editor) => {
      await editor.puts(message);
      await editor.puts("");
      await editor.note("Conflicts:");
      for (const name of this.repo.index.conflictPaths()) {
        await editor.note(`\t${name}`);
      }
      editor.close();
    });

    this.logger.error(`error: could not apply ${inputs.rightOid}`);
    CONFLICT_NOTES.split("\n").forEach((line) => this.logger.error(`hint: ${line}`));
    this.exit(1);
  }

  private async handleContinue() {
    try {
      await this.repo.index.load();
      await writeCherryPickCommit(this);
      this.exit(0);
    } catch (e) {
      switch (e.constructor) {
        case PendingCommitError:
          this.logger.error(`fatal: ${e.message}`);
          this.exit(128);
        default:
          throw e;
      }
    }
  }

  private mergeType(): "cherry_pick" {
    return "cherry_pick";
  }
}
