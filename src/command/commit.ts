import * as arg from "arg";
import { Base } from "./base";
import { CompleteCommit, Environment, Nullable } from "../types";
import {
  writeCommit,
  pendingCommit,
  resumeMerge,
  CommitOptions,
  defineWriteCommitOptions,
  readMessage,
  printCommit,
  commitMessagePath,
  writeTree,
  currentAuthor,
} from "./shared/write_commit";
import { Error, PendingCommit } from "../repository/pending_commit";
import { Revision } from "../revision";
import { asserts } from "../util";
import * as Database from "../database";

export const COMMIT_NOTES = `Please Enter the commit message for your changes. Lines starting
with '#' will be ignored, and an empty message aborts the commit.
`;

interface Options extends CommitOptions {
  /** Revision文字列 */
  reuse: Nullable<string>;
  amend: boolean;
}

export class Commit extends Base<Options> {
  pendingCommit: PendingCommit | null = null;
  constructor(args: string[], env: Environment) {
    super(args, env);
  }

  async run() {
    await this.repo.index.load();

    if (this.options["amend"]) {
      await this.handleAmend();
    }

    if (await pendingCommit(this).inProgress()) {
      await resumeMerge(this);
    }

    const parent = await this.repo.refs.readHead();
    const message = await this.composeMessage(
      (await readMessage(this)) ?? (await this.reusedMessage())
    );
    const commit = await writeCommit(parent ? [parent] : [], message, this);
    await printCommit(commit, this);
  }

  defineSpec(): arg.Spec {
    const spec = {
      "--reuse-message": (commit: string) => {
        this.options["reuse"] = commit;
        this.options["edit"] = false;
      },
      "-C": "--reuse-message",
      "--reedit-message": (commit: string) => {
        this.options["reuse"] = commit;
        this.options["edit"] = true;
      },
      "-c": "--reedit-message",
      "--amend": arg.flag(() => {
        this.options["amend"] = true;
      }),
      ...defineWriteCommitOptions(this),
    };
    return spec;
  }

  initOptions() {
    this.options = {
      reuse: null,
      amend: false,
    };
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

  async reusedMessage() {
    if (!this.options["reuse"]) {
      return null;
    }

    const revision = new Revision(this.repo, this.options["reuse"]);
    // 解決されたリビジョンはコミットID
    const commit = (await revision
      .resolve()
      .then((resolved) => this.repo.database.load(resolved))) as CompleteCommit;
    return commit.message;
  }

  async handleAmend() {
    const head = await this.repo.refs.readHead();
    asserts(head !== null, "--amendオプションはコミットが一つ以上存在する場合にのみ使われる");
    // HEADはコミットID
    const oldCommit = (await this.repo.database.load(head)) as CompleteCommit;
    const tree = await writeTree(this);

    const message = await this.composeMessage(oldCommit.message);
    if (message === null) {
      throw new Error("");
    }

    const commiter = currentAuthor(this);
    const newCommit = new Database.Commit(
      oldCommit.parents,
      tree.oid,
      oldCommit.author,
      commiter,
      message
    );

    await this.repo.database.store(newCommit);
    asserts(newCommit.oid !== null, "objectsへ保存されたコミットはOIDを持つ");
    await this.repo.refs.updateHead(newCommit.oid);

    this.exit(0);
  }
}
