import { Environment } from "@kit/core/types";

export interface RunnableConstructor {
  new (env: Environment): Runnable;
}

export interface Runnable {
  run(): Promise<void>;
}
