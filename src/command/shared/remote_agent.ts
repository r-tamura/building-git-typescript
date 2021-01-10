import * as fs from "fs";
import * as path from "path";
import * as remotes from "../../remotes";
import { Repository, RepositoryEnv } from "../../repository";
import { Pathname } from "../../types";
import { BaseError, isNodeError } from "../../util";
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
  capabilities?: string[];
}

export function acceptClient(
  cmd: RemoteAgent,
  { name, capabilities = [] }: AcceptClientParams
) {
  cmd.conn = new remotes.Protocol(name, cmd.stdin, cmd.stdout, capabilities);
}

export const ZERO_OID = "0".repeat(40);

export async function sendReferences(cmd: RemoteAgent, env: RepositoryEnv) {
  checkConnected(cmd.conn);
  const refs = await repo(cmd, env).refs.listAllRefs();
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
  return (cmd._repo ??= new Repository(gitDir, env));
}

function detectGitDir(cmd: RemoteAgent): string | undefined {
  const pathname = path.resolve(cmd.args[0]);

  const dirs = pathUtil
    .ascend(pathname)
    .flatMap((dir) => [dir, path.join(dir, ".git")]);

  return dirs.find(isGitRepository);
}

function isGitRepository(dirname: Pathname): boolean {
  let hasHeadFile = false;
  let hasObjectsDir = false;
  let hasRefDir = false;
  try {
    hasHeadFile = fs.lstatSync(path.join(dirname, "HEAD")).isFile();
    hasObjectsDir = fs.lstatSync(path.join(dirname, "objects")).isDirectory();
    hasRefDir = fs.lstatSync(path.join(dirname, "refs")).isDirectory();
  } catch (err: unknown) {
    if (isNodeError(err)) {
      if (err.code === "ENOENT") {
        return false;
      }
      throw err;
    }
  }

  return hasHeadFile && hasObjectsDir && hasRefDir;
}
