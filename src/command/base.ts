import * as path from "path";
import { Runnable } from "./types";
import { Environment, Pathname, EnvVars } from "../types";

/** process.exit 代替え */
export class Exit {}

export type BaseConstructor = {
  new (args: string[], env: Environment): Base;
};

export abstract class Base implements Runnable {
  /** 作業ディレクトリ */
  protected dir: string;
  /** 環境変数 */
  protected envvars: EnvVars;
  /** 終了ステータス */
  status: number = 0;
  constructor(protected args: string[], protected env: Environment) {
    this.dir = env.process.cwd();
    this.envvars = env.process.env;
  }
  abstract run(...args: string[]): Promise<void>;

  expeandedPathname(pathname: Pathname) {
    return path.resolve(this.dir, pathname);
  }

  exit(status: number) {
    this.status = status;
    throw new Exit();
  }

  async execute() {
    try {
      await this.run();
    } catch (e) {
      if (e instanceof Exit) {
        return;
      }
      throw e;
    }
  }

  log(...messages: string[]) {
    this.env.logger.info(...messages);
  }
}
