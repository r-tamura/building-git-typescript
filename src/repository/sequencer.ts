import * as fsCallback from "fs";
import * as path from "path";
import { Lockfile } from "../lockfile";
import { ORIG_HEAD } from "../refs";
import { FileService, rmrf } from "../services";
import { CompleteCommit, Nullable, Pathname } from "../types";
import { asserts, BaseError, splitByLine, strip } from "../util";
import { Repository } from "./repository";
const fs = fsCallback.promises;

interface Environment {
  fs?: FileService;
}

const UNSAFE_MESSAGE = "You seem to have moved HEAD. Not rewinding, check your HEAD!";

export class Sequencer {
  #repo: Repository;
  #pathname: Pathname;
  #todoPath: Pathname;
  #abortPath: Pathname;
  #headPath: Pathname;
  #todoFile: Nullable<Lockfile> = null;
  /** 未反映のコミットリスト */
  #commands: CompleteCommit[] = [];
  #fs: FileService;
  constructor(repo: Repository, env: Environment = {}) {
    this.#repo = repo;
    this.#pathname = path.join(repo.gitPath, "sequencer");
    this.#abortPath = path.join(this.#pathname, "abort-safety");
    this.#headPath = path.join(this.#pathname, "head");
    this.#todoPath = path.join(this.#pathname, "todo");
    this.#fs = env.fs ?? fs;
  }

  async start() {
    await this.#fs.mkdir(this.#pathname);
    const headOid = await this.#repo.refs.readHead();
    asserts(headOid !== null, "HEADが存在する");
    await this.writeFile(this.#headPath, headOid);
    await this.writeFile(this.#abortPath, headOid);

    await this.openTodoFile();
  }

  pick(commit: CompleteCommit) {
    this.#commands.push(commit);
  }

  nextCommand(): Nullable<CompleteCommit> {
    return this.#commands[0] ?? null;
  }

  async dropCommand() {
    this.#commands.shift() ?? null;
    const head = await this.#repo.refs.readHead();
    asserts(head !== null, "HEADが存在する");
    await this.writeFile(this.#abortPath, head);
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

  async abort() {
    const headOid = strip(await this.#fs.readFile(this.#headPath, "utf8"));
    const expected = strip(await this.#fs.readFile(this.#abortPath, "utf8"));
    const actual = await this.#repo.refs.readHead();

    await this.quit();
    if (actual !== expected) {
      throw new BaseError(UNSAFE_MESSAGE);
    }

    await this.#repo.hardReset(headOid);
    const origHead = await this.#repo.refs.updateHead(headOid);
    await this.#repo.refs.updateRef(ORIG_HEAD, origHead);
  }

  private async writeFile(pathname: Pathname, content: string) {
    const lockfile = new Lockfile(pathname);
    await lockfile.holdForUpdate();
    await lockfile.write(content);
    await lockfile.write("\n");
    await lockfile.commit();
  }
}
