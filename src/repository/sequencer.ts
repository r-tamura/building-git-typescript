import * as fsCallback from "fs";
import * as path from "path";
import { Lockfile } from "../lockfile";
import { FileService, rmrf } from "../services";
import { CompleteCommit, Nullable, Pathname } from "../types";
import { asserts, splitByLine } from "../util";
import { Repository } from "./repository";
const fs = fsCallback.promises;

interface Environment {
  fs?: FileService;
}

export class Sequencer {
  #repo: Repository;
  #pathname: Pathname;
  #todoPath: Pathname;
  #todoFile: Nullable<Lockfile> = null;
  /** 未反映のコミットリスト */
  #commands: CompleteCommit[] = [];
  #fs: FileService;
  constructor(repo: Repository, env: Environment = {}) {
    this.#repo = repo;
    this.#pathname = path.join(repo.gitPath, "sequencer");
    this.#todoPath = path.join(this.#pathname, "todo");
    this.#fs = env.fs ?? fs;
  }

  async start() {
    await this.#fs.mkdir(this.#pathname);
    await this.openTodoFile();
  }

  pick(commit: CompleteCommit) {
    this.#commands.push(commit);
  }

  nextCommand() {
    return this.#commands[0] ?? null;
  }

  dropCommand() {
    return this.#commands.shift() ?? null;
  }

  async openTodoFile() {
    const stat = await this.#fs.stat(this.#pathname);
    if (!stat.isDirectory()) {
      return;
    }
    this.#todoFile = new Lockfile(this.#todoPath);
    await this.#todoFile.holdForUpdate();
  }

  async dump() {
    if (this.#todoFile === null) {
      return;
    }
    for (const commit of this.#commands) {
      const short = this.#repo.database.shortOid(commit.oid);
      await this.#todoFile.write(`pick ${short} ${commit.titleLine()}\n`);
    }
    await this.#todoFile.commit();
  }

  async load() {
    await this.openTodoFile();
    const stat = await this.#fs.stat(this.#todoPath);
    if (!stat.isFile()) {
      return;
    }
    const content = await this.#fs.readFile(this.#todoPath, "utf8");
    this.#commands = [];
    for (const line of splitByLine(content)) {
      const match = /^pick (\S+) (.*)$/s.exec(line);
      asserts(match !== null, "todoファイルはsequencerでパース可能なファイル");
      const [_, oid, _title] = match;
      const oids = await this.#repo.database.prefixMatch(oid);
      // todoファイルに書き込まれるのはコミットIDのみ
      const commit = (await this.#repo.database.load(oids[0])) as CompleteCommit;
      this.#commands.push(commit);
    }
  }

  async quit() {
    await rmrf(this.#fs, this.#pathname);
  }
}
