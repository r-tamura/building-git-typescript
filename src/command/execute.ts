import { BaseError, asserts } from "../util";
import { Commit } from "./commit";
import { Init } from "./init";
import { Add } from "./add";
import { Environment } from "../types";
import { Base, BaseConstructor } from "./base";

export class Unknown extends BaseError {}

type CommandMap = { [s: string]: BaseConstructor };

const COMMANDS: CommandMap = {
  init: Init,
  add: Add,
  commit: Commit,
} as const;

export async function execute(args: string[], env: Environment) {
  const name = args.shift();
  asserts(typeof name === "string", "no subcommand specified.");

  const Command = COMMANDS[name];
  if (!Command) {
    throw new Unknown(`'${name} is not a jit command`);
  }
  const command = new Command(args, env);
  await command.execute();
  return command;
}
