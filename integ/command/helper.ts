import { promises } from "fs";
import * as path from "path";
import * as assert from "power-assert";
import { Readable, Writable } from "stream";
import { makeLogger } from "../../src/__test__/util";
import * as Command from "../../src/command";
import { Blob } from "../../src/database";
import { Editor } from "../../src/editor";
import { Repository } from "../../src/repository";
import { RevList } from "../../src/rev_list";
import { Revision } from "../../src/revision";
import * as FileService from "../../src/services";
import { defaultFs, exists, Logger, Process } from "../../src/services";
import { CompleteCommit, Dict, Environment, Pathname } from "../../src/types";
import { asserts } from "../../src/util";

export interface TestUtil {
  suffix: Pathname;
  cmd: Command.BaseCommand;
}

export function create(name?: string) {
  return new TestUtil(name);
}

const fs = promises;
export type Contents = [string, string][];
interface MockTTYOptions {
  isTTY?: boolean;
}

interface CommitOptions {
  time?: Date;
  author?: boolean;
}

/** ファイルを実行可能形式へ変更する命令 */
export const X = "x";
export class TestUtil {
  envvars: Process["env"] = {};
  #env: Environment;
  #repo: Repository;

  constructor(protected name = "") {
    this.suffix =
      name + randomChoice("0123456789abcdefghijklmnopqrstuvwxyz", 6);

    this.#env = {
      fs: defaultFs,
      logger: makeLogger(),
      process: {
        stdin: this.makeStdin(),
        stdout: this.makeStdout(),
        stderr: this.makeStderr(),
        env: this.envvars,
        cwd: jest.fn().mockReturnValue(this.repoPath),
      },
      date: {
        now: () => new Date(2020, 3, 1),
      },
    };
    this.#repo = new Repository(path.join(this.repoPath, ".git"), this.#env);
  }

  getEnv() {
    return this.#env;
  }

  setTime(time: Date) {
    this.setEnv({ date: { now: () => time } });
  }

  private setEnv(env: Partial<Environment>) {
    this.#env = { ...this.#env, ...env };
  }

  private mockEnvvar(key: string, value: string) {
    this.envvars[key] = value;
  }

  mockStdio(s: string) {
    this.#env.process = {
      ...this.#env.process,
      stdin: this.makeStdin(s),
      stdout: this.makeStdout(),
    };
  }

  /** Assersion */
  async assertWorkspace(
    contents: Contents,
    repository: Repository = this.repo,
  ) {
    const files: Contents = [];
    const pathnames = await repository.workspace.listFiles();
    for (const pathname of pathnames) {
      files.push([pathname, await repository.workspace.readFile(pathname)]);
    }

    assert.deepEqual(files, contents);
  }

  async assertIndex(expected: Contents) {
    const actual: Contents = [];
    await this.repo.index.load();
    for (const entry of this.repo.index.eachEntry()) {
      const bytes = await this.repo.database
        .load(entry.oid)
        .then((blob) => (blob as Blob).data);
      actual.push([entry.name, bytes.toString("utf8")]);
    }
    assert.deepEqual(actual, expected);
  }

  async assertExecutable(filename: string) {
    return await FileService.exists(fs, path.join(this.repoPath, filename));
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
    await fs.rm(this.repoPath, { recursive: true });
  };

  /** path */
  get repoPath() {
    return path.resolve(__dirname, "..", `test-${this.suffix}`);
  }

  get repo(): Repository {
    return this.#repo;
  }

  /** fs */
  // Note: 書籍中は'delete'と言う関数名だが、JavaScriptでは予約後のため'rm'にする
  async rm(name: string) {
    const pathname = path.join(this.repoPath, name);
    const stat = await fs.stat(pathname).catch((err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        return new Error(err.message);
      }
      throw err;
    });
    if (stat instanceof Error) {
      return;
    }

    if (stat.isDirectory()) {
      await fs.rm(pathname, { recursive: true });
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
    text = "",
    { isTTY = false }: MockTTYOptions = {},
  ): NodeJS.Process["stdin"] {
    const readable = Readable.from(text);
    return this.mockStreamAsTTY(readable as any, { isTTY });
  }

  makeStdout({
    isTTY = false,
  }: { isTTY?: boolean } = {}): NodeJS.Process["stdout"] {
    const writable = new Writable();
    return this.mockStreamAsTTY(writable as any, { isTTY });
  }

  makeStderr({
    isTTY = false,
  }: { isTTY?: boolean } = {}): NodeJS.Process["stderr"] {
    const writable = new Writable();
    return this.mockStreamAsTTY(writable as any, { isTTY });
  }

  mockStreamAsTTY<T>(
    stream: T,
    { isTTY }: { isTTY: boolean },
  ): T & MockTTYOptions {
    return { ...stream, isTTY };
  }

  /** simple git command */

  async kitCmd(...args: string[]) {
    // コマンド実行ごとにロガーはリセットする
    const env = this.getEnv();
    env.logger = makeLogger();
    this.cmd = await Command.execute(args, env);
    return;
  }

  async commit(
    message: string,
    { time = new Date(), author = true }: CommitOptions = {},
  ) {
    if (author) {
      this.mockEnvvar("GIT_AUTHOR_NAME", "A. U. Thor");
      this.mockEnvvar("GIT_AUTHOR_EMAIL", "author@example.com");
    }
    this.setTime(time);
    await this.kitCmd("commit", "-m", message);
  }

  async resolveRevision(expression: string) {
    return new Revision(this.repo, expression).resolve();
  }

  async loadCommit(expression: string) {
    return this.resolveRevision(expression).then(
      (oid) => this.repo.database.load(oid) as Promise<CompleteCommit>,
    );
  }

  async commitTree(message: string, files: Dict<string | string[] | null>) {
    for (const [filepath, contents] of Object.entries(files)) {
      if (contents !== X) {
        await this.rm(filepath);
      }
      if (contents === X) {
        await this.makeExecutable(filepath);
      } else if (typeof contents === "string") {
        await this.writeFile(filepath, contents);
      } else if (Array.isArray(contents)) {
        await this.writeFile(filepath, contents[0]);
        await this.makeExecutable(filepath);
      }
    }
    await this.rm(".git/index");
    await this.kitCmd("add", ".");
    await this.commit(message);
  }

  async history(...revisions: string[]) {
    const revlist = await RevList.fromRevs(this.repo, revisions);
    const commits = [] as CompleteCommit[];
    for await (const commit of revlist) {
      commits.push(commit);
    }
    return commits;
  }

  /**
   *   A   B   M
   *   o---o---o [master]
   *    \     /
   *     `---o [topic]
   *         C
   */
  async merge3(
    base: Dict<string | string[] | null>,
    left: Dict<string | string[] | null>,
    right: Dict<string | string[] | null>,
  ) {
    await this.commitTree("A", base);
    await this.commitTree("B", left);

    await this.kitCmd("branch", "topic", "master^");
    await this.kitCmd("checkout", "topic");
    await this.commitTree("C", right);

    await this.kitCmd("checkout", "master");
    await this.kitCmd("merge", "topic", "-m", "M");
  }
}

/**
 * 指定された文字列からランダムに length文字抽出した文字列を生成する。
 * 引数は ascii のみ
 * */
const randomChoice = (s: string, count = 1) => {
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

export function addSeconds(time: Date, n: number) {
  return new Date(time.getTime() + n * 1000);
}

export async function getRevListMessages(revs: RevList) {
  const messages = [] as string[];
  for await (const commit of revs) {
    messages.push(commit.message);
  }
  return messages;
}

export function spyEditor(content: string) {
  const spy = jest.spyOn(Editor, "edit").mockResolvedValue(content);
  return {
    restore: () => spy.mockRestore(),
  };
}
