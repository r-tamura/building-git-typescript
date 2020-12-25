import * as child_process from "child_process";
import * as shlex from "shlex";
import { URL } from "url";
import * as remotes from "../../remotes";

interface RemoteAgent {
  conn: remotes.Protocol;
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
}

export function acceptClient(
  name: string,
  capbilities = [] as string[],
  cmd: RemoteAgent
) {
  cmd.conn = new remotes.Protocol(name, cmd.stdin, cmd.stdout, capbilities);
}

interface StartAgentParams {
  name: string;
  program: string;
  url: string;
  capabilities: string[];
}

export function startAgent(
  cmd: RemoteAgent,
  { name, program, url, capabilities }: StartAgentParams
): void {
  const [command, ...args] = buildAgentCommand(program, url);
  const { stdin, stdout } = child_process.spawn(command, args);
  cmd.conn = new remotes.Protocol(name, stdout, stdin, capabilities);
}

function buildAgentCommand(program: string, url: string): string[] {
  const uri = new URL(url);
  return [...shlex.split(program), uri.pathname];
}
