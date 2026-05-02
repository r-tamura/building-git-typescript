import type { Environment } from "@kit/core/types";
import { asserts, BaseError } from "@kit/core/util";
import { Add } from "./add.js";
import type { BaseConstructor, NoOptions, Options } from "./base.js";
import { Branch } from "./branch.js";
import { Checkout } from "./checkout.js";
import { CherryPick } from "./cherry_pick.js";
import { Commit } from "./commit.js";
import { Config } from "./config.js";
import { Diff } from "./diff.js";
import { Fetch } from "./fetch.js";
import { InitCommand } from "./init.js";
import { Log } from "./log.js";
import { Merge } from "./merge.js";
import { Push } from "./push.js";
import { ReceivePack } from "./receive_pack.js";
import { Remote } from "./remote.js";
import { Reset } from "./reset.js";
import { Revert } from "./revert.js";
import { Rm } from "./rm.js";
import { Status } from "./status.js";
import { UploadPack } from "./upload_pack.js";

export class Unknown extends BaseError {}

type CommandMap<O extends Options = NoOptions> = {
  [s: string]: BaseConstructor<O>;
};

const COMMANDS: CommandMap = {
  init: InitCommand,
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
