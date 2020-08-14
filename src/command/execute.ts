import { BaseError, asserts } from "../util";
import { BaseConstructor, NoOptions, Options } from "./base";
import { Add } from "./add";
import { Commit } from "./commit";
import { Branch } from "./branch";
import { Checkout } from "./checkout";
import { Diff } from "./diff";
import { Init } from "./init";
import { Log } from "./log";
import { Merge } from "./merge";
import { Status } from "./status";
import { Environment } from "../types";
import { Rm } from "./rm";
import { Reset } from "./reset";
import { CherryPick } from "./cherry_pick";
import { Revert } from "./revert";
import { Config } from "./config";

export class Unknown extends BaseError {}

type CommandMap<O extends Options = NoOptions> = { [s: string]: BaseConstructor<O> };

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
} as const;

export async function execute(args: string[], env: Environment) {
  const name = args.shift();
  asserts(typeof name === "string", "no subcommand specified.");

  const Command = COMMANDS[name];
  if (!Command) {
    throw new Unknown(`'${name}' is not a jit command`);
  }
  const command = new Command(args, env);
  await command.execute();
  return command;
}
