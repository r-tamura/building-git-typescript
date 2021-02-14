import { Environment } from "../types";
import { asserts, BaseError } from "../util";
import { Add } from "./add";
import { BaseConstructor, NoOptions, Options } from "./base";
import { Branch } from "./branch";
import { Checkout } from "./checkout";
import { CherryPick } from "./cherry_pick";
import { Commit } from "./commit";
import { Config } from "./config";
import { Diff } from "./diff";
import { Fetch } from "./fetch";
import { Init } from "./init";
import { Log } from "./log";
import { Merge } from "./merge";
import { Push } from "./push";
import { ReceivePack } from "./receive_pack";
import { Remote } from "./remote";
import { Reset } from "./reset";
import { Revert } from "./revert";
import { Rm } from "./rm";
import { Status } from "./status";
import { UploadPack } from "./upload_pack";

export class Unknown extends BaseError {}

type CommandMap<O extends Options = NoOptions> = {
  [s: string]: BaseConstructor<O>;
};

const COMMANDS: CommandMap = {
  init: Init,
  add: Add,
  branch: Branch,
  checkout: Checkout,
  commit: Commit,
  diff: Diff,
  log: Log,
  merge: Merge,
  rm: Rm,
  reset: Reset,
  "cherry-pick": CherryPick,
  revert: Revert,
  status: Status,
  config: Config,
  remote: Remote,
  fetch: Fetch,
  "upload-pack": UploadPack,
  push: Push,
  "receive-pack": ReceivePack,
} as const;

export async function execute(args: string[], env: Environment) {
  const name = args.shift();
  asserts(typeof name === "string", "no subcommand specified.");

  const Command = COMMANDS[name];
  if (!Command) {
    throw new Unknown(`'${name}' is not a kit command`);
  }
  const command = new Command(args, env);
  await command.execute();
  return command;
}
