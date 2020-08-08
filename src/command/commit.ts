import { Base } from "./base";
import { Environment, Nullable } from "../types";
import {
  writeCommit,
  pendingCommit,
  resumeMerge,
  CommitOptions,
  defineWriteCommitOptions,
  CommitArgSpec,
  readMessage,
  printCommit,
  commitMessagePath,
} from "./shared/write_commit";
import { PendingCommit } from "../repository/pending_commit";

export const COMMIT_NOTES = `Please Enter the commit message for your changes. Lines starting
with '#' will be ignored, and an empty message aborts the commit.
`;

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
    const message = await readMessage(this).then((msg) => this.composeMessage(msg));
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

  async composeMessage(message: Nullable<string>) {
    return this.editFile(commitMessagePath(this), async (editor) => {
      await editor.puts(message ?? "");
      await editor.puts("");
      await editor.note(COMMIT_NOTES);

      if (!this.options["edit"]) {
        editor.close();
      }
    });
  }
}
