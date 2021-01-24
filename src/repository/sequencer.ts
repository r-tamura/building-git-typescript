import * as fsCallback from "fs";
import * as path from "path";
import { Options } from "../command/shared/sequencing";
import { Config, SectionName, Value } from "../config";
import { Lockfile } from "../lockfile";
import { ORIG_HEAD } from "../refs";
import { FileService, rmrf } from "../services";
import { CompleteCommit, Nullable, Pathname } from "../types";
import { asserts, BaseError, splitByLine, strip } from "../util";
import { Repository } from "./repository";
const fs = fsCallback.promises;

export interface Environment {
  fs?: FileService;
}

export type Action = "pick" | "revert";
export type Command = [Action, CompleteCommit];

const UNSAFE_MESSAGE =
  "You seem to have moved HEAD. Not rewinding, check your HEAD!";

export class Sequencer {
  #repo: Repository;
  #pathname: Pathname;
  #todoPath: Pathname;
  #abortPath: Pathname;
  #headPath: Pathname;
  #todoFile: Nullable<Lockfile> = null;
  /** 未反映のコミットリスト */
  #commands: Command[] = [];
  #config: Config;
  #fs: FileService;
  constructor(repo: Repository, env: Environment = {}) {
    this.#repo = repo;
    this.#pathname = path.join(repo.gitPath, "sequencer");
    this.#abortPath = path.join(this.#pathname, "abort-safety");
    this.#headPath = path.join(this.#pathname, "head");
    this.#todoPath = path.join(this.#pathname, "todo");
    this.#config = new Config(path.join(this.#pathname, "opts"));
    this.#fs = env.fs ?? fs;
  }

  async start(options: Options) {
    await this.#fs.mkdir(this.#pathname);
    const headOid = await this.#repo.refs.readHead();
    asserts(headOid !== null, "HEADが存在する");
    await this.writeFile(this.#headPath, headOid);
    await this.writeFile(this.#abortPath, headOid);

    await this.#config.openForUpdate();
    Object.entries(options).forEach(([key, value]) => {
      this.#config.set(["config", key], value);
    });
    await this.#config.save();

    await this.openTodoFile();
  }

  pick(commit: CompleteCommit) {
    this.#commands.push(["pick", commit]);
  }

  revert(commit: CompleteCommit) {
    this.#commands.push(["revert", commit]);
  }

  nextCommand(): Nullable<Command> {
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
    for (const [action, commit] of this.#commands) {
      const short = this.#repo.database.shortOid(commit.oid);
      await this.#todoFile.write(`${action} ${short} ${commit.titleLine()}\n`);
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
      // 's'(dotAll)フラグをつけることで改行も'.'のマッチ範囲に含まれる
      // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/dotAll
      const match = /^(\S+) (\S+) (.*)$/s.exec(line);
      asserts(match !== null, "todoファイルはsequencerでパース可能なファイル");
      const [_, action, oid, _title] = match;
      asserts(action === "pick" || action === "revert", "Action名");
      const oids = await this.#repo.database.prefixMatch(oid);
      // todoファイルに書き込まれるのはコミットIDのみ
      const commit = (await this.#repo.database.load(
        oids[0],
      )) as CompleteCommit;
      this.#commands.push([action, commit]);
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

  async getOption(varname: string) {
    await this.#config.open();
    return this.#config.get(["options", varname]);
  }

  private async writeFile(pathname: Pathname, content: string) {
    const lockfile = new Lockfile(pathname);
    await lockfile.holdForUpdate();
    await lockfile.write(content);
    await lockfile.write("\n");
    await lockfile.commit();
  }
}
