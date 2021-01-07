import * as child_process from "child_process";
import * as shlex from "shlex";
import { URL } from "url";
import * as remotes from "../../remotes";
import { OID } from "../../types";
import * as array from "../../util/array";
import { BaseError } from "../../util/error";
import { GitCommand } from "../base";
import { FastForwardError } from "./fast_forward";
import { checkConnected, Connectable } from "./remote_common";

const REF_LINE = /^([0-9a-f]+) (.*)$/;
const ZERO_OID = "0".repeat(40);

class NotSupportedProtocolError extends BaseError {}
export interface RemoteClient extends GitCommand, Connectable {
  remoteRefs: Record<string, string>;
}
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
  cmd: RemoteClient,
  { name, program, url, capabilities = [] }: StartAgentParams
): void {
  const [command, ...args] = buildAgentCommand(program, url);
  const { stdin, stdout } = child_process.spawn(command, args, {
    stdio: ["pipe", "pipe", "inherit"],
  });

  cmd.conn = new remotes.Protocol(name, stdout, stdin, capabilities);
}

export function buildAgentCommand(program: string, url: string): string[] {
  const uri = new URL(url);
  const argv = [...shlex.split(program), uri.pathname];

  switch (uri.protocol) {
    case "file:":
      return argv;
    case "ssh:":
      return sshCommand(uri, argv);
  }
  throw new NotSupportedProtocolError(`${uri.protocol} is not supported.`);
}

function sshCommand(uri: URL, argv: string[]): string[] {
  const ssh = ["ssh", uri.hostname];
  if (uri.port) {
    ssh.push("-p", uri.port);
  }
  if (uri.username) {
    ssh.push("-l", uri.username);
  }
  return [...ssh, argv.map((part) => shlex.quote(part)).join(" ")];
}

export async function recvReferences(cmd: RemoteClient) {
  checkConnected(cmd.conn);
  for await (const line of cmd.conn.recvUntil(null)) {
    if (line === null) {
      continue;
    }
    const match = REF_LINE.exec(line);
    if (match === null) {
      throw new BaseError(`Invalid record: '${line}'`);
    }
    const [_, oid, ref] = match;
    if (oid === ZERO_OID) {
      continue;
    }
    cmd.remoteRefs[ref] = oid.toLowerCase();
  }
}

type SouceTargetPair = readonly [
  source: remotes.SourceRef,
  target: remotes.TargetRef
];
interface ReportRefUpdateParams {
  readonly refNames: SouceTargetPair;
  readonly error?: FastForwardError;
  readonly oldOid?: OID;
  readonly newOid?: OID;
  readonly isFF: boolean;
}

export function reportRefUpdate(
  cmd: RemoteClient,
  { refNames, error, oldOid, newOid, isFF = false }: ReportRefUpdateParams
): void {
  if (error) {
    showRefUpdate(cmd, {
      flag: "!",
      summary: "[rejected]",
      refNames,
      reason: error,
    });
    return;
  }

  if (oldOid === newOid) {
    return;
  }

  if (oldOid === undefined) {
    showRefUpdate(cmd, { flag: "*", summary: "[new branch]", refNames });
  } else if (newOid === undefined) {
    showRefUpdate(cmd, { flag: "-", summary: "[deleted]", refNames });
  } else {
    reportRangeUpdate(cmd, { refNames, oldOid, newOid, isFF });
  }
}

interface ReportRangeUpdateParams {
  readonly refNames: SouceTargetPair;
  readonly oldOid: OID;
  readonly newOid: OID;
  readonly isFF: boolean;
}

function reportRangeUpdate(
  cmd: RemoteClient,
  { refNames, oldOid, newOid, isFF }: ReportRangeUpdateParams
) {
  const oldOidShort = cmd.repo.database.shortOid(oldOid);
  const newOidShort = cmd.repo.database.shortOid(newOid);

  if (isFF) {
    const revisions = `${oldOidShort}..${newOidShort}`;
    showRefUpdate(cmd, { flag: " ", summary: revisions, refNames });
  } else {
    const revisions = `${oldOidShort}...${newOidShort}`;
    showRefUpdate(cmd, {
      flag: "+",
      summary: revisions,
      refNames,
      reason: "forced update",
    });
  }
}

interface ShowRefUpdateParams {
  /** ' '/'+'/'-'/'!' 出力メッセージの前に付くシンボル  */
  readonly flag: " " | "*" | "+" | "-" | "!";
  readonly summary: string;
  readonly refNames: SouceTargetPair;
  readonly reason?: string;
}

function showRefUpdate(
  cmd: RemoteClient,
  { flag, summary, refNames, reason }: ShowRefUpdateParams
) {
  const names = array
    .compact(refNames)
    .map((name) => cmd.repo.refs.shortName(name));

  let message = `${flag} ${summary} ${names.join(" -> ")}`;
  if (reason) {
    message += ` (${reason})`;
  }
  cmd.logger.error(message);
}
