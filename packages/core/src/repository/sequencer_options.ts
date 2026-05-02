import type { Nullable } from "../types.js";

export interface SequencerOptions {
  mode: Nullable<"continue" | "abort" | "quit">;
  mainline: number;
}
