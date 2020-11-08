import * as arg from "arg";
import * as path from "path";
import * as Color from "../color";
import { EditCallback, Editor } from "../editor";
import { Pager } from "../pager";
import { Repository } from "../repository";
import { createLogger, Logger } from "../services";
import { Environment, EnvVars, Pathname } from "../types";
import { asserts } from "../util";
import { Runnable } from "./types";

/** process.exit 代替え */
export class Exit {}

export type BaseConstructor<O extends Options> = {
  new (args: string[], env: Environment): Base<O>;
};

// TODO: 型定義見直し
export type Options = object;
export type NoOptions = any;

export abstract class Base<O extends Options = NoOptions> implements Runnable {
  /** 作業ディレクトリ */
  protected dir: string;
  /** 環境変数 */
  envvars: EnvVars;
  /** ページャ-  */
  private pager: Pager | null = null;
  /** ロガー */
  public logger: Logger;
  /** プロセスの出力がTTYか */
  private isatty: boolean;
  /** this.env.process.stdoutへのショートカット */
  protected stdout: NodeJS.Process["stdout"];
  /** this.env.process.stderrへのショートカット */
  protected stderr: NodeJS.Process["stderr"];

  /** options */
  options!: O;

  /** 終了ステータス */
  status = 0;

  #repo!: Repository;
  constructor(protected args: string[], public env: Environment) {
    this.dir = env.process.cwd();
    this.envvars = env.process.env;
    this.isatty = env.process.stdout.isTTY;
    this.stdout = env.process.stdout;
    this.stderr = env.process.stderr;
    this.logger = env.logger;
  }

  abstract run(...args: string[]): Promise<void>;

  expeandedPathname(pathname: Pathname) {
    return path.resolve(this.dir, pathname);
  }

  async editFile(pathname: Pathname, callback: EditCallback) {
    const message = await Editor.edit(
      pathname,
      async (editor) => {
        await callback(editor);
        if (!this.isatty) {
          editor.close();
        }
      },
      await this.editorCommand(),
      { fs: this.env.fs, stdout: this.stdout, stderr: this.stderr }
    );
    return message;
  }

  exit(status: 0 | 1 | 2 | 3 | 5 | 128): never {
    this.status = status;
    throw new Exit();
  }

  fmt(style: Color.Style | Color.Style[], text: string) {
    return this.isatty ? Color.format(style, text) : text;
  }

  async execute() {
    this.parseOptions();
    try {
      await this.run();

      if (this.pager) {
        this.stdout.end();
      }
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
    return (this.#repo ??= new Repository(
      path.join(this.dir, ".git"),
      this.env
    ));
  }

  log(message: string) {
    // Note: rubyのputsは文字列が'\n'で終わると改行を挿入しない
    if (message.endsWith("\n")) {
      message = message.trimRight();
    } else if (message.endsWith("\n\x1b[m")) {
      // fmtでカラーリングされた場合
      message = message.replace("\n\x1b[m", "\x1b[m");
    }

    try {
      this.logger.info(message);
    } catch (e) {
      const nodeErr = e as NodeJS.ErrnoException;
      switch (nodeErr.code) {
        case "EPIPE":
          this.exit(0);
        // exitの返り値がneverのため, breakは必要ない
        // eslint-disable-next-line no-fallthrough
        default:
          throw e;
      }
    }
  }

  protected setupPager() {
    if (this.pager !== null) {
      return;
    }

    if (!this.isatty) {
      return;
    }

    this.pager = Pager.of(this.envvars, this.stdout, this.stderr);
    this.stdout = this.pager.input;
    this.logger = createLogger(this.stdout);
  }

  private async editorCommand() {
    const coreEditor = await this.repo.config.get(["core", "editor"]);
    asserts(typeof coreEditor === "string" || coreEditor === undefined);
    return (
      this.envvars["GIT_EDITOR"] ??
      coreEditor ??
      this.envvars["VISUAL"] ??
      this.envvars["EDITOR"]
    );
  }

  protected defineSpec(): arg.Spec {
    return {};
  }

  protected initOptions() {
    return;
  }

  private parseOptions() {
    this.initOptions();
    const spec = this.defineSpec();
    /** Note: ライブラリの意図した使い方とは違うが、RubyのOptionParserの使い方へ合わせる */
    const args = arg(spec, { argv: this.args });
    this.args = args._;
  }
}
