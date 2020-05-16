import { BaseError, asserts } from "../util";
import { Commit } from "./commit";
import { Init } from "./init";
import { BaseConstructor } from "./base";
import { Add } from "./add";
import { Diff } from "./diff";
import { Status } from "./status";
import { Environment } from "../types";

export class Unknown extends BaseError {}

type CommandMap = { [s: string]: BaseConstructor };

const COMMANDS: CommandMap = {
  init: Init,
  add: Add,
  commit: Commit,
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
