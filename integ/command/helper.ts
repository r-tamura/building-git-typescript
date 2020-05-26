import { promises } from "fs";
import { Readable, Writable } from "stream";
import * as path from "path";
import * as assert from "power-assert";
import { Environment, Pathname } from "~/types";
import { defaultFs, Logger, Process, exists } from "~/services";
import { Repository } from "~/repository";
import { makeLogger } from "~/__test__/util";
import * as Command from "~/command";
import { asserts } from "~/util";
import { Revision } from "~/revision";

export interface TestUtil {
  suffix: Pathname;
  cmd: Command.Base;
}

export function create() {
  return new TestUtil();
}

const fs = promises;
export type Contents = [string, string][];
export class TestUtil {
  envvars: Process["env"] = {};
  _env: Environment;
  _repo: Repository;

  constructor(name: string = "") {
    this.suffix =
      name + randomChoice("0123456789abcdefghijklmnopqrstuvwxyz", 6);

    this._env = {
      fs: defaultFs,
      logger: makeLogger(),
      process: {
        stdin: this.makeStdin(),
        stdout: this.makeStdout(),
        stderr: this.makeStdout(),
        env: this.envvars,
        cwd: jest.fn().mockReturnValue(this.repoPath),
      },
      date: {
        now: () => new Date(2020, 3, 1),
      },
    };
    this._repo = new Repository(path.join(this.repoPath, ".git"), this._env);
  }

  getEnv() {
    return this._env;
  }

  private setEnv(env: Partial<Environment>) {
    this._env = { ...this._env, ...env };
  }

  private setTime(time: Date) {
    this.setEnv({ date: { now: () => time } });
  }

  private mockEnvvar(key: string, value: string) {
    this.envvars[key] = value;
  }

  private mockStdio(s: string) {
    this._env.process = {
      ...this._env.process,
      stdin: this.makeStdin(s),
      stdout: this.makeStdout(),
    };
  }

  /** Assersion */
  async assertWorkspace(
    contents: Contents,
    repository: Repository = this.repo()
  ) {
    const files: Contents = [];
    const pathnames = await repository.workspace.listFiles();

    for (const pathname of pathnames) {
      files.push([pathname, await repository.workspace.readFile(pathname)]);
    }

    assert.deepEqual(files, contents);
  }

  async assertNoent(filename: string) {
    assert.equal(await exists(fs, path.join(this.repoPath, filename)), false);
  }

  /** Logger assertion */
  assertLog(level: Exclude<keyof Logger, "level">, expected: string) {
    const env = this.getEnv();
    const log = env.logger[level] as jest.Mock;

    const eachOut = log.mock.calls.map((call) => call.join(""));
    assert.equal(eachOut?.join("\n") ?? "", expected);
  }

  assertStatus(expected: number) {
    asserts(typeof this.cmd !== "undefined", "コマンドが最低一度は実行される");
    assert.equal(this.cmd.status, expected);
  }

  assertInfo(expected: string) {
    this.assertLog("info", expected);
  }

  assertWarn(expected: string) {
    this.assertLog("warn", expected);
  }

  assertError(expected: string) {
    this.assertLog("error", expected);
  }

  /** test hooks */
  beforeHook = async () => {
    await fs.mkdir(this.repoPath);
    await this.kitCmd("init", this.repoPath);
  };

  afterHook = async () => {
    await fs.rmdir(this.repoPath, { recursive: true });
  };

  /** path */
  get repoPath() {
    return path.resolve(__dirname, "..", `test-${this.suffix}`);
  }

  repo(): Repository {
    return this._repo;
  }

  /** fs */
  // Note: 書籍中は'delete'と言う関数名だが、JavaScriptでは予約後のため'rm'にする
  async rm(name: string) {
    const pathname = path.join(this.repoPath, name);
    const stat = await fs.stat(pathname);

    if (stat.isDirectory()) {
      await fs.rmdir(pathname, { recursive: true });
    } else {
      await fs.unlink(pathname);
    }
  }

  async mkdir(name: string) {
    const pathname = path.join(this.repoPath, name);
    await fs.mkdir(path.dirname(pathname), { recursive: true });
  }

  async writeFile(name: string, contents: string) {
    const pathname = path.join(this.repoPath, name);
    await fs.mkdir(path.dirname(pathname), { recursive: true });
    await fs.writeFile(pathname, contents, { encoding: "utf8" });
  }

  async makeExecutable(name: string) {
    await fs.chmod(path.join(this.repoPath, name), 0o755);
  }

  async makeUnreadable(name: string) {
    await fs.chmod(path.join(this.repoPath, name), 0o200);
  }

  async touch(name: string) {
    const now = new Date();
    await fs.utimes(path.join(this.repoPath, name), now, now);
  }

  /** I/O
   * TODO: stdin/stdoutの良いモック方法を考える
   */
  makeStdin(
    text: string = "",
    { isTTY = false }: { isTTY?: boolean } = {}
  ): typeof process.stdin {
    const readable = Readable.from(text) as any;
    return this.mockStreamAsTTY(readable, { isTTY });
  }

  makeStdout({
    isTTY = false,
  }: { isTTY?: boolean } = {}): typeof process.stdout {
    const writable = new Writable() as any;
    return this.mockStreamAsTTY(writable, { isTTY });
  }

  mockStreamAsTTY<T>(stream: T, { isTTY }: { isTTY: boolean }): T {
    (stream as any).isTTY = isTTY;
    return stream;
  }

  /** simple git command */

  async kitCmd(...args: string[]) {
    // コマンド実行ごとにロガーはリセットする
    const env = this.getEnv();
    env.logger = makeLogger();
    this.cmd = await Command.execute(args, env);
    return;
  }

  async commit(message: string, time: Date = new Date()) {
    this.mockEnvvar("GIT_AUTHOR_NAME", "A. U. Thor");
    this.mockEnvvar("GIT_AUTHOR_EMAIL", "author@example.com");
    this.mockStdio(message);
    this.setTime(time);
    await this.kitCmd("commit");
  }

  async resolveRevision(expression: string) {
    return new Revision(this.repo(), expression).resolve();
  }

  async loadCommit(expression: string) {
    return this.resolveRevision(expression).then((oid) =>
      this.repo().database.load(oid)
    );
  }
}

/**
 * 指定された文字列からランダムに length文字抽出した文字列を生成する。
 * 引数は ascii のみ
 * */
const randomChoice = (s: string, count: number = 1) => {
  const max = s.length;
  let res = "";
  for (let i = 0; i < count; i++) {
    const i = Math.floor(Math.random() * max);
    res += s[i];
  }
  return res;
};

/** other utils */
export async function delay(ms: number) {
  return new Promise((resolve, _) => setTimeout(resolve, ms));
}
