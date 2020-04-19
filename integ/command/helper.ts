import { promises } from "fs";
import { Readable } from "stream";
import * as rmfr from "rmfr";
import * as path from "path";
import * as assert from "power-assert";
import { Environment } from "~/types";
import { defaultFs, Logger, Process } from "~/services";
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
    stdin: Readable.from([""]),
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

function setEnvvar(key: string, value: string) {
  envvars[key] = value;
}

function setStdin(s: string) {
  _env.process = { ..._env.process, stdin: Readable.from([s]) };
}

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

export async function beforeHook() {
  await fs.mkdir(repoPath());
  await jitCmd("init", repoPath());
  jest.clearAllMocks();
}

export async function afterHook() {
  await rmfr(repoPath());
}

export async function commit(message: string) {
  setEnvvar("GIT_AUTHOR_NAME", "A. U. Thor");
  setEnvvar("GIT_AUTHOR_EMAIL", "author@example.com");
  setStdin(message);
  await jitCmd("commit");
}

export function repoPath() {
  return path.resolve(__dirname, "../tmp-repo");
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

let _repo: Repository;
export function repo(): Repository {
  const env = getEnv();
  return (_repo = _repo ?? new Repository(path.join(repoPath(), ".git"), env));
}

let cmd: Command.Base;
export async function jitCmd(...args: string[]) {
  // コマンド実行ごとにロガーはリセットする
  const env = getEnv();
  env.logger = makeLogger();
  cmd = await Command.execute(args, env);
  return;
}
