import { BaseError, asserts } from "../util";
import { BaseConstructor } from "./base";
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

export class Unknown extends BaseError {}

type CommandMap = { [s: string]: BaseConstructor<any> };

const COMMANDS: CommandMap = {
  init: Init,
  add: Add,
  branch: Branch,
  checkout: Checkout,
  commit: Commit,
  diff: Diff,
  log: Log,
  merge: Merge,
  status: Status,
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
