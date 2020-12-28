import * as fs from "fs";
import * as path from "path";
import * as remotes from "../../remotes";
import { Repository, RepositoryEnv } from "../../repository";
import { Pathname } from "../../types";
import { BaseError } from "../../util";
import * as pathUtil from "../../util/fs";
import { GitCommand } from "../base";
import { checkConnected, Connectable } from "./remote_common";

export interface RemoteAgent extends GitCommand, Connectable {
  readonly stdin: NodeJS.Process["stdin"];
  readonly stdout: NodeJS.Process["stdout"];
}

interface AcceptClientParams {
  name: string;
  /**
   * @default []
   */
  capbilities?: string[];
}

export function acceptClient(
  cmd: RemoteAgent,
  { name, capbilities = [] }: AcceptClientParams
) {
  cmd.conn = new remotes.Protocol(name, cmd.stdin, cmd.stdout, capbilities);
}

const ZERO_OID = "0".repeat(40);

export async function sendReferences(cmd: RemoteAgent) {
  checkConnected(cmd.conn);
  const refs = await cmd.repo.refs.listAllRefs();
  let sent = false;

  refs.sort((ref1, ref2) => ref1.path.localeCompare(ref2.path));
  for (const symref of refs) {
    const oid = await symref.readOid();
    if (oid === null) {
      return;
    }
    cmd.conn.sendPacket(`${oid.toLowerCase()} ${symref.path}`);
    sent = true;
  }

  if (sent) {
    cmd.conn.sendPacket(`${ZERO_OID} capabilities^{}`);
  }
  cmd.conn.sendPacket(null);
}

export function repo(cmd: RemoteAgent, env: RepositoryEnv): Repository {
  const gitDir = detectGitDir(cmd);
  if (gitDir === undefined) {
    throw new BaseError("couldn't detect any git directory");
  }
  return (cmd.repo ??= new Repository(gitDir, env));
}

function detectGitDir(cmd: RemoteAgent): string | undefined {
  const pathname = path.resolve(cmd.args[0]);
  const dirs = pathUtil
    .ascend(pathname)
    .flatMap((dir) => [dir, path.join(dir, ".git")]);
  return dirs.find(isGitRepository);
}

function isGitRepository(dirname: Pathname): boolean {
  const hasHeadFile = fs.lstatSync(path.join(dirname, "HEAD")).isFile();
  const hasObjectsDir = fs
    .lstatSync(path.join(dirname, "objects"))
    .isDirectory();
  const hasRefDir = fs.lstatSync(path.join(dirname, "refs")).isDirectory();

  return hasHeadFile && hasObjectsDir && hasRefDir;
}
