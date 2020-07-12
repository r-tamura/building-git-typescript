import { Base } from "./base";
import { readTextStream } from "../services";
import { Environment } from "../types";
import { writeCommit, pendingCommit, resumeMerge } from "./shared/write_commit";
import { PendingCommit } from "../repository/pending_commit";

export class Commit extends Base {
  pendingCommit: PendingCommit | null = null;
  constructor(args: string[], env: Environment) {
    super(args, env);
  }

  async run() {
    const { process } = this.env;
    await this.repo.index.load();
    if (await pendingCommit(this).inProgress()) {
      await resumeMerge(this);
    }

    const parent = await this.repo.refs.readHead();
    const message = await readTextStream(process.stdin);
    const commit = await writeCommit(parent ? [parent] : [], message, this);
    const isRoot = parent === null ? "(root-commit) " : "";
    this.log(`[${isRoot}${commit.oid}] ${message.split("\n")[0]}`);
  }
}
