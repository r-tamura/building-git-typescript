import { execute, Unknown } from "./command";
import { defaultFs, defaultLogger, defaultProcess } from "./services";
import { Environment } from "./types";

export function createMain() {
  const env: Environment = {
    process: defaultProcess,
    logger: defaultLogger,
    fs: defaultFs,
    date: {
      now: () => new Date(),
    },
  };

  return async (argv: string[]) => {
    await main(argv, env);
  };
}

export async function main(argv: string[], env: Environment) {
  try {
    await execute(argv, env);
  } catch (e) {
    if (e instanceof Unknown) {
      console.error(`kit: ${e.message}`);
    } else {
      console.error(`fatal: ${e.message}`);
      if (process.env.DEBUG) {
        console.error(e.stack);
      }
    }
    process.exit(0);
  }
}
