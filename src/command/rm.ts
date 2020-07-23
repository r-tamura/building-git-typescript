import { Inspector } from "../repository/inspector";
import { OID, Pathname } from "../types";
import { BaseError, Runtime } from "../util/error";
import { isempty } from "../util/array";
import { asserts } from "../util/assert";
import { Base } from "./base";

export class Rm extends Base {
  #headOid!: OID;
  #inspector!: Inspector;
  #uncommitted!: Pathname[];
  #unstaged!: Pathname[];

  async run() {
    await this.repo.index.loadForUpdate();

    try {
      const headOid = await this.repo.refs.readHead();
      asserts(headOid !== null);
      this.#headOid = headOid;
      this.#inspector = new Inspector(this.repo);
      this.#uncommitted = [];
      this.#unstaged = [];

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
      const appErr = e as BaseError;
      if (appErr.name === "Runtime") {
        await this.repo.index.releaseLock();
        this.logger.error(`fatal: ${appErr.message}`);
        this.exit(128);
      }
    }
  }

  private async planRemoval(pathname: Pathname) {
    if (!this.repo.index.trackedFile(pathname)) {
      throw new Runtime(`pathspec '${pathname}' did not match any files`);
    }

    const item = await this.repo.database.loadTreeEntry(this.#headOid, pathname);
    const entry = this.repo.index.entryForPath(pathname);
    const stat = await this.repo.workspace.statFile(pathname);

    if (this.#inspector.compareTreeToIndex(item, entry)) {
      this.#uncommitted.push(pathname);
    } else if (stat && (await this.#inspector.compareIndexToWorkspace(entry, stat))) {
      this.#unstaged.push(pathname);
    }
  }

  private async removeFile(pathname: Pathname) {
    await this.repo.index.remove(pathname);
    await this.repo.workspace.remove(pathname);
    this.log(`rm '${pathname}'`);
  }

  private async exitOnErrors() {
    if (isempty(this.#uncommitted) && isempty(this.#unstaged)) {
      return;
    }

    this.printErrors(this.#uncommitted, "changes staged in the index");
    this.printErrors(this.#unstaged, "local modifications");

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
