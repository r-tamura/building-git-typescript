import { Inspector } from "../repository/inspector";
import { OID, Pathname } from "../types";
import { Runtime } from "../util/error";
import { isempty } from "../util/array";
import { asserts } from "../util/assert";
import { Base, Exit } from "./base";
import arg = require("arg");

interface Options {
  cached: boolean;
  force: boolean;
  recursive: boolean;
}

const BOTH_CHANGED = "staged content different from both the file and the HEAD";
const INDEX_CHANGED = "changes staged in the index";
const WORKSPACE_CHANGED = "local modifications";

export class Rm extends Base<Options> {
  #headOid!: OID;
  #inspector!: Inspector;
  /** 未コミットファイルリスト。未コミットのファイルが存在する場合は削除を実行しない。 */
  #uncommitted!: Pathname[];
  /** 未ステージングファイルリスト。未ステージングのファイルが存在する場合は削除を実行しない。 */
  #unstaged!: Pathname[];
  /** ワークスペースとデータベースの両方で変更があるファイルのリスト */
  #bothChanged!: Pathname[];

  async run() {
    await this.repo.index.loadForUpdate();

    try {
      const headOid = await this.repo.refs.readHead();
      asserts(headOid !== null);
      this.#headOid = headOid;
      this.#inspector = new Inspector(this.repo);
      this.#uncommitted = [];
      this.#unstaged = [];
      this.#bothChanged = [];

      this.args = this.args.flatMap((pathname) => this.expandPath(pathname));

      for (const pathname of this.args) {
        await this.planRemoval(pathname);
      }
      await this.exitOnErrors();

      // TODO: 並列化できるかも
      for (const pathname of this.args) {
        await this.removeFile(pathname);
      }
      await this.repo.index.writeUpdates();
    } catch (e) {
      if (e.constructor === Exit) {
        throw e;
      }
      await this.repo.index.releaseLock();
      this.logger.error(`fatal: ${e.message}`);
      this.exit(128);
    }
  }

  defineSpec() {
    return {
      "--cached": arg.flag(() => {
        this.options["cached"] = true;
      }),
      "--force": arg.flag(() => {
        this.options["force"] = true;
      }),
      "-f": "--force",
      "-r": arg.flag(() => {
        this.options["recursive"] = true;
      }),
    };
  }

  initOptions() {
    this.options = {
      cached: false,
      force: false,
      recursive: false,
    };
  }

  /**
   * 指定されたパスのファイルを削除できる条件が満たされているかを判定します
   * @param pathname 削除対象のファイルパス
   */
  private async planRemoval(pathname: Pathname) {
    if (this.options["force"]) {
      return;
    }

    const stat = await this.repo.workspace.statFile(pathname);
    if (stat?.isDirectory()) {
      throw new Runtime(`kit rm: '${pathname}': Operation not permitted`);
    }

    const item = await this.repo.database.loadTreeEntry(this.#headOid, pathname);
    const entry = this.repo.index.entryForPath(pathname);

    const stagedChange = this.#inspector.compareTreeToIndex(item, entry);
    const unstagedChange = stat ? await this.#inspector.compareIndexToWorkspace(entry, stat) : null;

    if (stagedChange && unstagedChange) {
      this.#bothChanged.push(pathname);
    } else if (stagedChange) {
      if (!this.options["cached"]) {
        this.#uncommitted.push(pathname);
      }
    } else if (unstagedChange) {
      if (!this.options["cached"]) {
        this.#unstaged.push(pathname);
      }
    }
  }

  private expandPath(pathname: Pathname) {
    if (this.repo.index.trackedDirectory(pathname)) {
      if (this.options["recursive"]) {
        return this.repo.index.childPaths(pathname);
      }
      throw new Runtime(`not removing '${pathname}' recursively without -r`);
    }

    if (this.repo.index.trackedFile(pathname)) {
      return [pathname];
    }
    throw new Runtime(`pathspec '${pathname}' did not match any files`);
  }

  private async removeFile(pathname: Pathname) {
    await this.repo.index.remove(pathname);
    if (!this.options["cached"]) {
      await this.repo.workspace.remove(pathname);
    }
    this.log(`rm '${pathname}'`);
  }

  private async exitOnErrors() {
    if ([this.#bothChanged, this.#uncommitted, this.#unstaged].every(isempty)) {
      return;
    }

    // console.log({
    //   both: this.#bothChanged,
    //   uncm: this.#uncommitted,
    //   unst: this.#unstaged,
    // });

    this.printErrors(this.#bothChanged, BOTH_CHANGED);
    this.printErrors(this.#uncommitted, INDEX_CHANGED);
    this.printErrors(this.#unstaged, WORKSPACE_CHANGED);

    await this.repo.index.releaseLock();

    this.exit(1);
  }

  private printErrors(paths: Pathname[], message: string) {
    if (isempty(paths)) {
      return;
    }

    const filesHave = paths.length === 1 ? "file has" : "files have";
    this.logger.error(`error: the following ${filesHave} ${message}:`);
    paths.forEach((pathname) => {
      this.logger.error(`   ${pathname}`);
    });
  }
}
