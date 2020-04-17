import { BaseError } from "../util";
import { RunnableConstructor } from "./types";
import { Commit } from "./commit";
import { Init } from "./init";
import { Add } from "./add";
import { Environment } from "../types";

export class Unknown extends BaseError {}

type CommandMap = { [s: string]: RunnableConstructor };

const COMMANDS: CommandMap = {
  init: Init,
  add: Add,
  commit: Commit,
} as const;

export async function execute(
  name: string = "",
  args: string[],
  env: Environment
) {
  const Command = COMMANDS[name];
  if (!Command) {
    throw new Unknown(`'${name} is not a jit command`);
  }
  const command = new Command(env);
  await command.run(...args);
}
