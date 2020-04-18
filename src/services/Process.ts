import { Readable } from "stream";

export type Process = Pick<typeof process, "cwd" | "env"> & { stdin: Readable };
export const defaultProcess = process;
