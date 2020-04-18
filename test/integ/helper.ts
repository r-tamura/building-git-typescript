import { promises } from "fs";
import * as rmfr from "rmfr";
import * as path from "path";
import * as assert from "power-assert";
import { Environment } from "~/types";
import { defaultFs, defaultProcess } from "~/services";
import { Repository } from "~/repository";
import { makeLogger } from "~/__test__/util";
import * as Command from "~/command";
import { asserts } from "~/util";

const fs = promises;

export const env: Environment = {
  fs: defaultFs,
  logger: makeLogger(),
  process: {
    ...defaultProcess,
    env: {},
    cwd: jest.fn().mockReturnValue(repoPath()),
  },
  date: {
    now: () => new Date(2020, 3, 1),
  },
};

function assertLog(level: "info" | "warn" | "error", expected: string) {
  const log = env.logger[level] as jest.Mock;
  assert.equal(log.mock.calls?.[0]?.[0] ?? "", expected);
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

export function repoPath() {
  return path.resolve(__dirname, "../tmp-repo");
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
  return (_repo = _repo ?? new Repository(path.join(repoPath(), ".git"), env));
}

let cmd: Command.Base;
export async function jitCmd(...args: string[]) {
  cmd = await Command.execute(args, env);
  return;
}
