import * as arg from "arg";
import { OID, CompleteTree, CompleteCommit, Pathname } from "../../types";
import { Base } from "../base";
import { Author, Commit, Tree } from "../../database";
import { asserts } from "../../util";
import { PendingCommit } from "../../repository/pending_commit";

export const CONFLICT_MESSAGE = `hint: Fix them up in the work tree, and then use 'kit add/rm <file>'
hint: as appropriate to mark resolution and make a commit.
fatal: Exiting because of an unresolved conflict.
`;

export interface CommitOptions {
  message?: string;
  file?: Pathname;
}

export interface CommitArgSpec extends arg.Spec {
  "--message": arg.Handler;
  "-m": "--message";
  "--file": arg.Handler;
  "-F": "--file";
}

export function defineWriteCommitOptions<O extends CommitOptions>(cmd: Base<O>): CommitArgSpec {
  return {
    "--message": (message: string) => {
      cmd.options["message"] = message;
    },
    "-m": "--message",
    "--file": (pathname: Pathname) => {
      cmd.options["file"] = pathname;
    },
    "-F": "--file",
  };
}

export async function readMessage<O extends CommitOptions>(cmd: Base<O>) {
  if (cmd.options["message"]) {
    return `${cmd.options["message"]}`;
  } else if (cmd.options["file"]) {
    return cmd.repo.env.fs.readFile(cmd.options["file"], "utf-8");
  }
}

/**
 * コンフリクト解決後に再度マージを実行します。
 * マージコミットメッセージはコンフリクト発生時のマージで指定されたメッセージが利用されます。
 * コンフリクトが解決されていない場合はプロセスを終了します。
 */
export async function resumeMerge(cmd: Base & CommitPendable) {
  handleConflictedIndex(cmd);
  const [left, right] = await Promise.all([
    cmd.repo.refs.readHead(),
    pendingCommit(cmd).mergeOid(),
  ]);
  asserts(left !== null, "マージを実行した時点でHEADは存在する");
  const parents = [left, right];
  await writeCommit(parents, await pendingCommit(cmd).mergeMessage(), cmd);

  await pendingCommit(cmd).clear();

  return cmd.exit(0);
}

export async function writeCommit(parents: OID[], message: string, cmd: Base) {
  const tree = await writeTree(cmd);
  const name = cmd.envvars["GIT_AUTHOR_NAME"];
  const email = cmd.envvars["GIT_AUTHOR_EMAIL"];
  // prettier-ignore
  asserts(typeof name === "string", "Environment variable 'GIT_AUTHOR_NAME' is not set.");
  // prettier-ignore
  asserts(typeof email === "string", "Environment variable 'GIT_AUTHOR_EMAIL' is not set.");
  const author = new Author(name, email, cmd.env.date.now());

  const commit = new Commit(parents, tree.oid, author, message);
  await cmd.repo.database.store(commit);
  asserts(commit.oid !== null, "Database#storeによりはoidが設定される");

  await cmd.repo.refs.updateHead(commit.oid);

  return commit as CompleteCommit;
}

export async function writeTree(cmd: Base) {
  const root = Tree.build(cmd.repo.index.eachEntry());
  await root.traverse((tree) => cmd.repo.database.store(tree));
  asserts(root.oid !== null, "Database#storeによりはoidが設定される");
  return root as CompleteTree;
}

export function handleConflictedIndex(cmd: Base) {
  if (!cmd.repo.index.conflict()) {
    return;
  }

  const message = "Committing is not possible because you have unmerged files.";
  cmd.logger.error(`error: ${message}`);
  cmd.logger.error(CONFLICT_MESSAGE);
  cmd.exit(128);
}

export async function printCommit(commit: CompleteCommit, cmd: Base) {
  const ref = await cmd.repo.refs.currentRef();
  const oid = cmd.repo.database.shortOid(commit.oid);

  let info = ref.head() ? "detached HEAD" : ref.shortName();
  if (!commit.parent) {
    info += " (root-commit)";
  }
  info += ` ${oid}`;
  cmd.log(`[${info}] ${commit.titleLine()}`);
}

type CommitPendable = { pendingCommit: PendingCommit | null }
export function pendingCommit(cmd: Base & CommitPendable) {
  return cmd.pendingCommit ??= cmd.repo.pendingCommit();
}
