import { OID, CompleteTree, CompleteCommit } from "../../types";
import { Base } from "../base";
import { Author, Commit, Tree } from "../../database";
import { asserts } from "../../util";
import { PendingCommit } from "../../repository/pending_commit";

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

type CommitPendable = { pendingCommit: PendingCommit }
export function pendingCommit(cmd: Base & CommitPendable) {
  return cmd.pendingCommit ??= cmd.repo.pendingCommit();
}
