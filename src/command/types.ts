import { Environment } from "../types";

export interface RunnableConstructor {
  new (env: Environment): Runnable;
}

export interface Runnable {
  run(): Promise<void>;
}
