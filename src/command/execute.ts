import { BaseError, asserts } from "../util";
import { Commit } from "./commit";
import { BaseConstructor } from "./base";
import { Init } from "./init";
import { Add } from "./add";
import { Diff } from "./diff";
import { Status } from "./status";
import { Branch } from "./branch";
import { Checkout } from "./checkout";
import { Log } from "./log";
import { Environment } from "../types";

export class Unknown extends BaseError {}

type CommandMap = { [s: string]: BaseConstructor<any> };

const COMMANDS: CommandMap = {
  init: Init,
  add: Add,
  branch: Branch,
  checkout: Checkout,
  commit: Commit,
  log: Log,
  status: Status,
  diff: Diff,
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
