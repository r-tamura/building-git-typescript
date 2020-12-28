import * as child_process from "child_process";
import * as shlex from "shlex";
import { URL } from "url";
import * as remotes from "../../remotes";
import { BaseError } from "../../util/error";
import { GitCommand } from "../base";
import { checkConnected, Connectable } from "./remote_common";

const REF_LINE = /^([0-9a-f]+)(.*)$/;
const ZERO_OID = "0".repeat(40);

interface StartAgentParams {
  name: string;
  program: string;
  url: string;
  /**
   * @default []
   */
  capabilities?: string[];
}

export function startAgent(
  cmd: Connectable,
  { name, program, url, capabilities = [] }: StartAgentParams
): void {
  const [command, ...args] = buildAgentCommand(program, url);
  const { stdin, stdout } = child_process.spawn(command, args);
  cmd.conn = new remotes.Protocol(name, stdout, stdin, capabilities);
}

function buildAgentCommand(program: string, url: string): string[] {
  const uri = new URL(url);
  return [...shlex.split(program), uri.pathname];
}
export interface RemoteClient extends GitCommand, Connectable {
  remoteRefs: Record<string, string>;
}

export async function recvReferences(cmd: RemoteClient) {
  checkConnected(cmd.conn);
  for await (const line of cmd.conn.recvUntil(null)) {
    if (line === null) {
      continue;
    }
    const match = REF_LINE.exec(line);
    if (match === null) {
      throw new BaseError(`Invalid record: ${line}`);
    }
    const [_, oid, ref] = match;
    if (oid === ZERO_OID) {
      continue;
    }
    cmd.remoteRefs[ref] = oid.toLowerCase();
  }
}
