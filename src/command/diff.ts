import * as path from "path";
import { Base } from "./base";
import * as Repository from "../repository";
import { Pathname, OID } from "../types";
import * as Database from "../database";
import * as Index from "../gindex";

const NULL_OID = "0".repeat(40);
const NULL_PATH = "/dev/null";

export class Diff extends Base {
  #status!: Repository.Status;
  async run() {
    await this.repo.index.load();
    this.#status = await this.repo.status;

    for (const [pathname, state] of this.#status.workspaceChanges.entries()) {
      switch (state) {
        case "modified":
          await this.diffFileModified(pathname);
          break;
        case "deleted":
          await this.diffFileDeleted(pathname);
          break;
      }
    }
  }

  private async diffFileModified(pathname: Pathname) {
    const entry = this.repo.index.entryForPath(pathname);

    // a
    const a_oid = entry.oid;
    const a_mode = entry.mode.toString(8);
    const a_path = path.join("a", pathname);

    // b
    const wsContents = await this.repo.workspace.readFile(pathname);
    const blob = new Database.Blob(wsContents);
    const b_oid = this.repo.database.hashObject(blob);
    const b_mode = Index.Entry.modeForStat(
      this.#status.stats[pathname]
    ).toString(8);
    const b_path = path.join("b", pathname);

    this.log(`diff --git ${a_path} ${b_path}`);

    if (a_mode !== b_mode) {
      this.log(`old mode ${a_mode}`);
      this.log(`new mode ${b_mode}`);
    }

    if (a_oid === b_oid) {
      return;
    }

    let oidRange = `index ${this.short(a_oid)}..${this.short(b_oid)}`;
    if (a_mode === b_mode) {
      oidRange += ` ${a_mode}`;
    }
    this.log(oidRange);
    this.log(`--- ${a_path}`);
    this.log(`+++ ${b_path}`);
  }

  private diffFileDeleted(pathname: Pathname) {
    const entry = this.repo.index.entryForPath(pathname);

    // a
    const a_oid = entry.oid;
    const a_mode = entry.mode.toString(8);
    const a_path = path.join("a", pathname);

    // b
    const b_oid = NULL_OID;
    const b_path = path.join("b", pathname);

    this.log(`diff --git ${a_path} ${b_path}`);
    this.log(`deleted file mode ${a_mode}`);
    this.log(`index ${this.short(a_oid)}..${this.short(b_oid)}`);
    this.log(`--- ${a_path}`);
    this.log(`+++ ${NULL_PATH}`);
  }

  private short(oid: OID) {
    return this.repo.database.shortOid(oid);
  }
}
