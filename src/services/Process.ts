export type Process = Pick<typeof process, "cwd" | "env">;
export const defaultProcess = process;
