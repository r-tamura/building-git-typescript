import { Console } from "console";

export type Logger = {
  level: "debug" | "info" | "warn" | "error";
  debug: (...msgs: string[]) => void;
  info: (...msgs: string[]) => void;
  warn: (...msgs: string[]) => void;
  error: (...msgs: string[]) => void;
};

export function createLogger(
  stdout: NodeJS.WriteStream = process.stdout,
  stderr: NodeJS.WriteStream = stdout,
  level: Logger["level"] = "info"
) {
  const con = new Console(stdout, stderr, false);
  return {
    level,
    debug: con.debug,
    info: con.log,
    warn: con.warn,
    error: con.error,
  };
}

export const defaultLogger = createLogger();
