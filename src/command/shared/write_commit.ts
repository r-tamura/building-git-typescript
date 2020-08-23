import * as path from "path";
import * as arg from "arg";
import { OID, CompleteTree, CompleteCommit, Pathname, Nullable } from "../../types";
import { Base } from "../base";
import { Author, Commit, Tree } from "../../database";
import { asserts, assertsComplete, BaseError } from "../../util";
import { Error, MergeType, PendingCommit } from "../../repository/pending_commit";
import { COMMIT_NOTES } from "../commit";

export const CONFLICT_MESSAGE = `hint: Fix them up in the work tree, and then use 'kit add/rm <file>'
hint: as appropriate to mark resolution and make a commit.
fatal: Exiting because of an unresolved conflict.
`;
const MERGE_NOTES = `
  It looks like you may be committing a merge.
  If this is not correct, please remove the file
  \t.git/MERGE_HEAD
  and try again.
`;
const CHERRY_PICK_NOTES = `
  It looks like you may be committing a cherry-pick.
  If this is not correct, please remove the file
  \t.git/CHERRY_PICK_HEAD
  and try again.
`;
export type CommitPendable = { pendingCommit: PendingCommit | null }
export interface CommitOptions {
  message?: string;
  file?: Pathname;
  edit?: "auto" | boolean;
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
      if (cmd.options["edit"] === "auto") {
        cmd.options["edit"] = false;
      }
    },
    "-m": "--message",
    "--file": (pathname: Pathname) => {
      cmd.options["file"] = pathname;
      if (cmd.options["edit"] === "auto") {
        cmd.options["edit"] = false;
      }
    },
    "-F": "--file",
    "--edit": arg.flag(() => {
      cmd.options["edit"] = true;
    }),
    "-e": "--edit",
    "--no-edit": arg.flag(() => {
      cmd.options["edit"] = false;
    })
  };
}

export async function readMessage<O extends CommitOptions>(cmd: Base<O>) {
  if (cmd.options["message"]) {
    return `${cmd.options["message"]}`;
  } else if (cmd.options["file"]) {
    return cmd.repo.env.fs.readFile(cmd.options["file"], "utf-8") as Promise<string>;
  }
  return null;
}

/**
 * コンフリクト解決後に再度マージを実行します。
 * マージコミットメッセージはコンフリクト発生時のマージで指定されたメッセージが利用されます。
 * コンフリクトが解決されていない場合はプロセスを終了します。
 */
export async function resumeMerge(type: MergeType, cmd: Base & CommitPendable) {

  switch(type) {
    case "merge":
      await writeMergeCommit(cmd);
      break;
    case "cherry_pick":
      await writeCherryPickCommit(cmd);
      break;
    case "revert":
      await writeRevertCommit(cmd);
      break;
  }

  return cmd.exit(0);
}


export async function writeMergeCommit(cmd: Base & CommitPendable) {
  handleConflictedIndex(cmd);
  const [left, right] = await Promise.all([
    cmd.repo.refs.readHead(),
    pendingCommit(cmd).mergeOid(),
  ]);
  asserts(left !== null, "マージを実行した時点でHEADは存在する");
  const parents = [left, right];

  const message = await composeMergeMessage(MERGE_NOTES, cmd);
  await writeCommit(parents, message, cmd);

  await pendingCommit(cmd).clear("merge");
}

export async function writeCherryPickCommit(cmd: Base & CommitPendable) {
  handleConflictedIndex(cmd);
  const head = await cmd.repo.refs.readHead();
  asserts(head !== null, "cherry-pick時点でHEADは存在する");
  const parents = [head];
  const message = await composeMergeMessage(CHERRY_PICK_NOTES, cmd);
  if (message === null) {
    throw new Error("コミットメッセージが存在しません");
  }
  const pickOid = await pendingCommit(cmd).mergeOid("cherry_pick");
  const commit = await cmd.repo.database.load(pickOid);
  asserts(commit.type === "commit", "cherry-pick対象のオブジェクトIDはコミットID");
  const tree = await writeTree(cmd);
  const picked = new Commit(parents, tree.oid, commit.author, await currentAuthor(cmd), message);

  await cmd.repo.database.store(picked);
  assertsComplete(picked);
  await cmd.repo.refs.updateHead(picked.oid);
  await pendingCommit(cmd).clear("cherry_pick");
}

export async function writeRevertCommit(cmd: Base & CommitPendable) {
  handleConflictedIndex(cmd);

  const head = await cmd.repo.refs.readHead();
  asserts(head !== null, "revert時点でHEADは存在する");
  const parents = [head];
  const message = await composeMergeMessage(null, cmd);
  await writeCommit(parents, message, cmd);

  await pendingCommit(cmd).clear("revert");
}

export async function writeCommit(parents: OID[], message: Nullable<string>, cmd: Base) {

  if (!message) {
    cmd.logger.error("Aborting commit due to empty commit message.");
    cmd.exit(1);
  }

  const tree = await writeTree(cmd);
  const name = cmd.envvars["GIT_AUTHOR_NAME"];
  const email = cmd.envvars["GIT_AUTHOR_EMAIL"];
  asserts(name !== undefined, "Environment variable 'GIT_AUTHOR_NAME' is not set.");
  asserts(email !== undefined, "Environment variable 'GIT_AUTHOR_EMAIL' is not set.");
  const author = new Author(name, email, cmd.env.date.now());

  const commit = new Commit(parents, tree.oid, author, author, message);
  await cmd.repo.database.store(commit);
  asserts(commit.oid !== null, "Database#storeによりはoidが設定される");

  await cmd.repo.refs.updateHead(commit.oid);

  return commit as CompleteCommit;
}

/**
 * index内のオブジェクトをobjectsへ保存する
 * @param cmd
 */
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

export function composeMergeMessage(notes: Nullable<string> = null, cmd: Base & CommitPendable) {
  return cmd.editFile(commitMessagePath(cmd), async (editor) => {
    await editor.puts(await pendingCommit(cmd).mergeMessage());
    if (notes) {
      await editor.note(notes);
    }
    await editor.puts("");
    await editor.note(COMMIT_NOTES);
  });
}

export function commitMessagePath(cmd: Base) {
  return path.join(cmd.repo.gitPath, "COMMIT_EDITMSG");
}

export function pendingCommit(cmd: Base & CommitPendable) {
  return cmd.pendingCommit ??= cmd.repo.pendingCommit();
}

export async function currentAuthor(cmd: Base) {
  const configName = await cmd.repo.config.get(["user", "name"]);
  const configEmail = await cmd.repo.config.get(["user", "email"]);
  asserts(configName === undefined || typeof configName === "string");
  asserts(configEmail === undefined || typeof configEmail === "string");

  const name = cmd.envvars["GIT_AUTHOR_NAME"] ?? configName;
  const email = cmd.envvars["GIT_AUTHOR_EMAIL"] ?? configEmail;

  if (name === undefined) {
    throw new BaseError("GIT_AUTHOR_NAMEもしくはコンフィグファイルにauthorがセットされている必要がある");
  }
  if (email === undefined) {
    throw new BaseError("GIT_AUTHOR_EMAILもしくはコンフィグファイルにemailがセットされている必要がある");
  }
  return new Author(name, email, new Date);
}
