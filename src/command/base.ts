import * as path from "path";
import { Runnable } from "./types";
import { Environment, Pathname, EnvVars } from "../types";
import { Repository } from "../repository";
import { Logger } from "../services";
import * as Color from "../color";

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
  /** ロガー */
  protected logger: Logger;

  /** 終了ステータス */
  status: number = 0;

  #repo!: Repository;
  constructor(protected args: string[], protected env: Environment) {
    this.dir = env.process.cwd();
    this.envvars = env.process.env;
    this.logger = env.logger;
  }

  abstract run(...args: string[]): Promise<void>;

  expeandedPathname(pathname: Pathname) {
    return path.resolve(this.dir, pathname);
  }

  exit(status: number) {
    this.status = status;
    throw new Exit();
  }

  fmt(style: Color.Style, text: string) {
    return this.env.process.stdout.isTTY ? Color.format(style, text) : text;
  }

  async execute() {
    try {
      await this.run();
    } catch (e) {
      switch (e.constructor) {
        case Exit:
          return;
        default:
          throw e;
      }
    }
  }

  get repo() {
    return (this.#repo =
      this.#repo ?? new Repository(path.join(this.dir, ".git"), this.env));
  }

  log(message: string) {
    // Note: rubyのputsは文字列が'\n'で終わると改行を挿入しない
    if (message.endsWith("\n")) {
      message = message.trimRight();
    }
    this.env.logger.info(message);
  }
}
