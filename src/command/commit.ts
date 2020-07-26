import { Base } from "./base";
import { Environment } from "../types";
import {
  writeCommit,
  pendingCommit,
  resumeMerge,
  CommitOptions,
  defineWriteCommitOptions,
  CommitArgSpec,
  readMessage,
  printCommit,
} from "./shared/write_commit";
import { PendingCommit } from "../repository/pending_commit";
import { asserts } from "../util";

export class Commit extends Base<CommitOptions> {
  pendingCommit: PendingCommit | null = null;
  constructor(args: string[], env: Environment) {
    super(args, env);
  }

  async run() {
    await this.repo.index.load();
    if (await pendingCommit(this).inProgress()) {
      await resumeMerge(this);
    }

    const parent = await this.repo.refs.readHead();
    const message = await readMessage(this);
    asserts(message !== undefined, "コミットメッセージが必要");
    const commit = await writeCommit(parent ? [parent] : [], message, this);
    await printCommit(commit, this);
  }

  defineSpec() {
    const spec: CommitArgSpec = defineWriteCommitOptions(this);
    return spec;
  }

  initOptions() {
    this.options = {};
  }
}
