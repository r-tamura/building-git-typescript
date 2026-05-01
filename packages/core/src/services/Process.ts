export type Process = Pick<
  typeof process,
  "cwd" | "env" | "stdout" | "stdin" | "stderr"
>;
export const defaultProcess = process;
