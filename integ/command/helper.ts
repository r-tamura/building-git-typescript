import { promises } from "fs";
import { Readable, Writable, Stream } from "stream";
import * as path from "path";
import * as assert from "power-assert";
import { Environment } from "~/types";
import { defaultFs, Logger, Process, exists } from "~/services";
import { Repository } from "~/repository";
import { makeLogger } from "~/__test__/util";
import * as Command from "~/command";
import { asserts } from "~/util";

let envvars: Process["env"] = {};

const fs = promises;

const _env: Environment = {
  fs: defaultFs,
  logger: makeLogger(),
  process: {
    stdin: makeStdin(),
    stdout: makeStdout(),
    stderr: makeStdout(),
    env: envvars,
    cwd: jest.fn().mockReturnValue(repoPath()),
  },
  date: {
    now: () => new Date(2020, 3, 1),
  },
};

function getEnv() {
  return _env;
}

function mockEnvvar(key: string, value: string) {
  envvars[key] = value;
}

function mockStdio(s: string) {
  _env.process = {
    ..._env.process,
    stdin: makeStdin(),
    stdout: makeStdout(),
  };
}

/** Assersion */
export type Contents = [string, string][];
export async function assertWorkspace(
  contents: Contents,
  repository: Repository = repo()
) {
  const files: Contents = [];
  const pathnames = await repository.workspace.listFiles();

  for (const pathname of pathnames) {
    files.push([pathname, await repository.workspace.readFile(pathname)]);
  }

  assert.deepEqual(files, contents);
}

export async function assertNoent(filename: string) {
  assert.equal(await exists(fs, path.join(repoPath(), filename)), false);
}

/** Logger assertion */
function assertLog(level: Exclude<keyof Logger, "level">, expected: string) {
  const env = getEnv();
  const log = env.logger[level] as jest.Mock;

  const eachOut = log.mock.calls.map((call) => call.join(""));
  assert.equal(eachOut?.join("\n") ?? "", expected);
}

export function assertStatus(expected: number) {
  asserts(typeof cmd !== "undefined");
  assert.equal(cmd.status, expected);
}

export function assertInfo(expected: string) {
  assertLog("info", expected);
}

export function assertError(expected: string) {
  assertLog("error", expected);
}

/** test hooks */
export async function beforeHook() {
  await fs.mkdir(repoPath());
  await jitCmd("init", repoPath());
}

export async function afterHook() {
  await fs.rmdir(repoPath(), { recursive: true });
}

/** path */
export function repoPath() {
  return path.resolve(__dirname, "../tmp-repo");
}

let _repo: Repository;
export function repo(): Repository {
  const env = getEnv();
  return (_repo = _repo ?? new Repository(path.join(repoPath(), ".git"), env));
}

/** fs */
// Note: 書籍中は'delete'と言う関数名だが、JavaScriptでは予約後のため'rm'にする
export async function rm(name: string) {
  const pathname = path.join(repoPath(), name);
  const stat = await fs.stat(pathname);

  if (stat.isDirectory()) {
    await fs.rmdir(pathname, { recursive: true });
  } else {
    await fs.unlink(pathname);
  }
}

export async function mkdir(name: string) {
  const pathname = path.join(repoPath(), name);
  await fs.mkdir(path.dirname(pathname), { recursive: true });
}

export async function writeFile(name: string, contents: string) {
  const pathname = path.join(repoPath(), name);
  await fs.mkdir(path.dirname(pathname), { recursive: true });
  await fs.writeFile(pathname, contents, { encoding: "utf8" });
}

export async function makeExecutable(name: string) {
  await fs.chmod(path.join(repoPath(), name), 0o755);
}

export async function makeUnreadable(name: string) {
  await fs.chmod(path.join(repoPath(), name), 0o200);
}

export async function touch(name: string) {
  const now = new Date();
  await fs.utimes(path.join(repoPath(), name), now, now);
}

/** I/O
 * TODO: stdin/stdoutの良いモック方法を考える
 */
function makeStdin(
  text: string = "",
  { isTTY = false }: { isTTY?: boolean } = {}
): typeof process.stdin {
  const readable = Readable.from(text) as any;
  return mockStreamAsTTY(readable, { isTTY });
}

function makeStdout({
  isTTY = false,
}: { isTTY?: boolean } = {}): typeof process.stdout {
  const writable = new Writable() as any;
  return mockStreamAsTTY(writable, { isTTY });
}

function mockStreamAsTTY<T>(stream: T, { isTTY }: { isTTY: boolean }): T {
  (stream as any).isTTY = isTTY;
  return stream;
}

/** simple git command */
let cmd: Command.Base;
export async function jitCmd(...args: string[]) {
  // コマンド実行ごとにロガーはリセットする
  const env = getEnv();
  env.logger = makeLogger();
  cmd = await Command.execute(args, env);
  return;
}

export async function commit(message: string) {
  mockEnvvar("GIT_AUTHOR_NAME", "A. U. Thor");
  mockEnvvar("GIT_AUTHOR_EMAIL", "author@example.com");
  mockStdio(message);
  await jitCmd("commit");
}

/** other utils */
export async function delay(ms: number) {
  return new Promise((resolve, _) => setTimeout(resolve, ms));
}
