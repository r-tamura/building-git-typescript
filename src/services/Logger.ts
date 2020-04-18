export type Logger = {
  level: "debug" | "info" | "warn" | "error";
  debug: (...msgs: string[]) => void;
  info: (...msgs: string[]) => void;
  warn: (...msgs: string[]) => void;
  error: (...msgs: string[]) => void;
};

export const defaultLogger: Logger = {
  level: "info",
  debug: console.debug,
  info: console.log,
  warn: console.warn,
  error: console.error,
};
