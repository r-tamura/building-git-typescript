export type Process = Pick<typeof process, "cwd" | "env" | "stdout" | "stdin">;
export const defaultProcess = process;
