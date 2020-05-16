import * as path from "path";
import { Base } from "./base";
import * as Repository from "../repository";
import { Pathname, OID } from "../types";
import * as Database from "../database";
import * as Index from "../gindex";
import { asserts } from "../util";
import { diff, Hunk, TextDocument } from "../diff";

const NULL_OID = "0".repeat(40);
const NULL_PATH = "/dev/null";

export class Diff extends Base {
  #status!: Repository.Status;
  async run() {
    await this.repo.index.load();
    this.#status = await this.repo.status;
    if (this.args[0] === "--cached") {
      await this.diffHeadIndex();
    } else {
      await this.diffIndexWorkspace();
    }
  }

  private async diffHeadIndex() {
    for (const [pathname, state] of this.#status.indexChanges.entries()) {
      switch (state) {
        case "added": {
          this.printDiff(
            this.fromNothing(pathname),
            await this.fromIndex(pathname)
          );
          break;
        }
        case "modified": {
          this.printDiff(
            await this.fromHead(pathname),
            await this.fromIndex(pathname)
          );
          break;
        }
        case "deleted": {
          this.printDiff(
            await this.fromHead(pathname),
            this.fromNothing(pathname)
          );
          break;
        }
      }
    }
  }

  private async diffIndexWorkspace() {
    for (const [pathname, state] of this.#status.workspaceChanges.entries()) {
      switch (state) {
        case "modified": {
          this.printDiff(
            await this.fromIndex(pathname),
            await this.fromFile(pathname)
          );
          break;
        }
        case "deleted": {
          this.printDiff(
            await this.fromIndex(pathname),
            this.fromNothing(pathname)
          );
          break;
        }
      }
    }
  }

  private diffHunks(a: TextDocument, b: TextDocument) {
    return Hunk.filter(diff(a, b));
  }

  private async fromHead(pathname: Pathname) {
    const entry = this.#status.headTree[pathname];
    const blob = await this.repo.database.load(entry.oid);
    asserts(blob instanceof Database.Blob);
    return Target.of(
      pathname,
      entry.oid,
      entry.mode.toString(8),
      blob.data.toString()
    );
  }

  private async fromIndex(pathname: Pathname) {
    const entry = this.repo.index.entryForPath(pathname);
    const blob = await this.repo.database.load(entry.oid);
    asserts(blob instanceof Database.Blob);
    return Target.of(
      entry.name,
      entry.oid,
      entry.mode.toString(8),
      blob.data.toString()
    );
  }

  private async fromFile(pathname: Pathname) {
    const content = await this.repo.workspace.readFile(pathname);
    const blob = new Database.Blob(content);
    const oid = this.repo.database.hashObject(blob);
    const mode = Index.Entry.modeForStat(this.#status.stats[pathname]);
    return Target.of(pathname, oid, mode.toString(8), blob.data.toString());
  }

  private fromNothing(pathname: Pathname) {
    return Target.of(pathname, NULL_OID, null, "");
  }

  private printDiff(a: Target, b: Target) {
    if (a.equals(b)) {
      return;
    }

    a.name = path.join("a", a.name);
    b.name = path.join("b", b.name);

    this.log(`diff --git ${a.name} ${b.name}`);
    this.printMode(a, b);
    this.printDiffContent(a, b);
  }

  private printMode(a: Target, b: Target) {
    if (a.mode === null) {
      this.log(`new file mode ${b.mode}`);
    } else if (b.mode === null) {
      this.log(`deleted file mode ${a.mode}`);
    } else if (a.mode !== b.mode) {
      this.log(`old mode ${a.mode}`);
      this.log(`new mode ${b.mode}`);
    }
  }

  private printDiffContent(a: Target, b: Target) {
    if (a.equalsContent(b)) {
      return;
    }

    let oidRange = `index ${this.short(a.oid)}..${this.short(b.oid)}`;
    if (a.mode === b.mode) {
      oidRange += ` ${a.mode}`;
    }
    this.log(oidRange);
    this.log(`--- ${a.deffPath}`);
    this.log(`+++ ${b.deffPath}`);

    const hunks = this.diffHunks(a.data, b.data);
    hunks.forEach(this.printDiffHunk.bind(this));
  }

  private printDiffHunk(hunk: Hunk) {
    this.log(hunk.header());
    hunk.edits.forEach((e) => {
      this.log(e.toString());
    });
  }

  private short(oid: OID) {
    return this.repo.database.shortOid(oid);
  }
}

class Target {
  constructor(
    public name: Pathname,
    public oid: OID,
    public mode: string | null,
    public data: string
  ) {}

  static of(name: Pathname, oid: OID, mode: string | null, data: string) {
    return new this(name, oid, mode, data);
  }

  get deffPath() {
    return this.mode ? this.name : NULL_PATH;
  }

  equals(b: Target) {
    return this.oid === b.oid && this.mode === b.mode;
  }

  equalsContent(b: Target) {
    return this.oid === b.oid;
  }
}
