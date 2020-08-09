import { spawnSync, SpawnSyncReturns } from "child_process";
import * as fsCallback from "fs";
import { O_CREAT, O_TRUNC, O_WRONLY } from "constants";
import { promises } from "fs";
import * as shlex from "shlex";
import { FileService, Process } from "./services";
import { Nullable, Pathname } from "./types";
import { splitByLine, strip } from "./util/text";
import { Error } from "./repository/pending_commit";
const fs = fsCallback.promises;

const DEFAULT_EDITOR = "vi";

interface Environment {
  fs?: FileService;
  stdout?: Process["stdout"];
  stderr?: Process["stderr"];
}

export type EditCallback = (editor: Editor) => Promise<void>;

export class Editor {
  #pathname: Pathname;
  #command: string;
  #closed = false;
  #file: Nullable<promises.FileHandle> = null;
  #fs: NonNullable<Environment["fs"]>;
  #stdout: NonNullable<Environment["stdout"]>;
  #stderr: NonNullable<Environment["stderr"]>;
  static async edit(
    pathname: Pathname,
    callback: EditCallback,
    command: string | undefined = undefined,
    env: Environment = {}
  ) {
    const editor = new this(pathname, command, env);
    await callback(editor);
    return editor.editFile();
  }

  constructor(pathname: Pathname, command: string = DEFAULT_EDITOR, env: Environment = {}) {
    this.#pathname = pathname;
    this.#command = command;
    this.#fs = env.fs ?? fs;
    this.#stdout = env.stdout ?? process.stdout;
    this.#stderr = env.stderr ?? process.stderr;
  }

  async editFile() {
    await this.file().then((file) => file.close());
    const [editorCommand, ...commandArgs] = shlex.split(this.#command);
    commandArgs.push(this.#pathname);

    // Note: stdioを親プロセスと共有させる必要がある
    // closeされていないときは、エディタでの編集を行う
    if (
      !this.#closed &&
      !isProcessFinishedSuccessfully(
        spawnSync(editorCommand, commandArgs, { stdio: ["inherit", this.#stdout, this.#stderr] })
      )
    ) {
      throw new Error(`There was a problem with the editor '${this.#command}'`);
    }

    return this.removeNotes(await this.#fs.readFile(this.#pathname, "utf-8"));
  }

  async puts(text: string) {
    if (this.#closed) {
      return;
    }
    await this.file().then((file) => file.write(text + "\n"));
  }

  async note(text: string) {
    if (this.#closed) {
      return;
    }
    for (const line of splitByLine(text)) {
      await this.file().then((file) => file.write(`# ${line}`));
    }
  }

  close() {
    this.#closed = true;
  }

  async file() {
    const flags = O_WRONLY | O_CREAT | O_TRUNC;
    return this.#file ??= await this.#fs.open(this.#pathname, flags);
  }

  private removeNotes(text: string) {
    const lines = splitByLine(text).filter((line) => !line.startsWith("#"));

    if (lines.every((line) => /^\s*$/.test(line))) {
      return null;
    } else {
      return strip(lines.join(""));
    }
  }
}

/**
 * プロセスが正常終了したかを返り値から判定します
 * 0: 正常終了
 * 0以外: エラー
 */
function isProcessFinishedSuccessfully(res: SpawnSyncReturns<string | Buffer>) {
  return res.status === 0;
}
