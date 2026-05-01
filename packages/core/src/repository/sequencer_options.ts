import { Nullable } from "../types";

export interface SequencerOptions {
  mode: Nullable<"continue" | "abort" | "quit">;
  mainline: number;
}
