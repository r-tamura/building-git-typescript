import { FileService, Process, defaultProcess, defaultFs } from "./services";
import { execute, Unknown } from "./command";
import { Environment } from "./types";

export function createMain() {
  const env: Environment = {
    process: defaultProcess,
    fs: defaultFs,
    date: {
      now: () => new Date(),
    },
  };

  return (argv: string[]) => {
    main(argv, env);
  };
}

export async function main(argv: string[], env: Environment) {
  const commandName = argv.shift();
  try {
    await execute(commandName, argv, env);
  } catch (e) {
    if (e instanceof Unknown) {
      console.error(`jit: ${e.message}`);
    } else {
      console.error(`fatal: ${e.message}`);
      if (process.env.DEBUG) {
        console.error(e.stack);
      }
    }
    process.exit(1);
  }
}
