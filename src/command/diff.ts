import * as path from "path";
import { Base } from "./base";
import * as Repository from "../repository";
import { Pathname, OID } from "../types";
import * as Database from "../database";
import * as arg from "arg";
import * as Index from "../gindex";
import { asserts } from "../util";
import { diff, Hunk, TextDocument, Edit } from "../diff";
import { definePrintDiffOptions, Target, NULL_OID } from "./shared/print_diff";
import { Stage } from "../gindex";

interface Option {
  cached: boolean;
  patch: boolean;
  stage?: Stage;
}

export class Diff extends Base<Option> {
  #status!: Repository.Status;
  async run() {
    await this.repo.index.load();
    this.#status = await this.repo.status;

    this.setupPager();

    if (this.options.cached) {
      await this.diffHeadIndex();
    } else {
      await this.diffIndexWorkspace();
    }
  }

  initOptions() {
    this.options = {
      cached: false,
      patch: true,
    };
  }

  defineSpec(): arg.Spec {
    const printDiffOptions = definePrintDiffOptions(this);
    return {
      "--cached": arg.flag(() => {
        this.options.cached = true;
      }),
      "--staged": "--cached",
      "--base": arg.flag(() => {
        this.options.stage = 1;
      }),
      "--ours": arg.flag(() => {
        this.options.stage = 2;
      }),
      "--theirs": arg.flag(() => {
        this.options.stage = 3;
      }),
      ...printDiffOptions,
    };
  }

  private async diffHeadIndex() {
    if (!this.options.patch) {
      return;
    }
    for (const [pathname, state] of this.#status.indexChanges.entries()) {
      switch (state) {
        case "added": {
          const targetFromIndex = await this.fromIndex(pathname);
          asserts(targetFromIndex !== null, `ファイル '${pathname}' は存在する`);
          this.printDiff(this.fromNothing(pathname), targetFromIndex);
          break;
        }
        case "modified": {
          const targetFromIndex = await this.fromIndex(pathname);
          asserts(targetFromIndex !== null, `ファイル '${pathname}' は存在する`);
          this.printDiff(await this.fromHead(pathname), targetFromIndex);
          break;
        }
        case "deleted": {
          this.printDiff(await this.fromHead(pathname), this.fromNothing(pathname));
          break;
        }
      }
    }
  }

  private async diffIndexWorkspace() {
    if (!this.options.patch) {
      return;
    }

    const paths = [...this.#status.conflicts.keys(), ...this.#status.workspaceChanges.keys()];

    for (const pathname of paths.sort()) {
      if (this.#status.conflicts.has(pathname)) {
        await this.printConflictDiff(pathname);
      } else {
        await this.printWorkspaceDiff(pathname);
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
    return Target.of(pathname, entry.oid, entry.mode.toString(8), blob.data.toString());
  }

  private async fromIndex(pathname: Pathname, stage: Stage = 0) {
    const entry = this.repo.index.entryForPath(pathname, stage);
    if (!entry) {
      return null;
    }
    const blob = await this.repo.database.load(entry.oid);
    asserts(blob instanceof Database.Blob);
    return Target.of(entry.name, entry.oid, entry.mode.toString(8), blob.data.toString());
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

  private header(text: string) {
    this.log(this.fmt("bold", text));
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

  private async printConflictDiff(pathname: Pathname) {
    this.log(`* Unmerged path ${pathname}`);

    const target = await this.fromIndex(pathname, this.options["stage"]);
    if (!target) {
      return;
    }
    this.printDiff(target, await this.fromFile(pathname));
  }

  private async printWorkspaceDiff(pathname: Pathname) {
    switch (this.#status.workspaceChanges.get(pathname)) {
      case "modified": {
        const targetFromIndex = await this.fromIndex(pathname);
        asserts(targetFromIndex !== null, `ファイル '${pathname}' は存在する`);
        this.printDiff(targetFromIndex, await this.fromFile(pathname));
        break;
      }
      case "deleted": {
        const targetFromIndex = await this.fromIndex(pathname);
        asserts(targetFromIndex !== null, `ファイル '${pathname}' は存在する`);
        this.printDiff(targetFromIndex, this.fromNothing(pathname));
        break;
      }
    }
  }

  private printMode(a: Target, b: Target) {
    if (a.mode === null) {
      this.header(`new file mode ${b.mode}`);
    } else if (b.mode === null) {
      this.header(`deleted file mode ${a.mode}`);
    } else if (a.mode !== b.mode) {
      this.header(`old mode ${a.mode}`);
      this.header(`new mode ${b.mode}`);
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

  private printDiffEdit(edit: Edit) {
    const text = edit.toString();
    switch (edit.type) {
      case "eql":
        this.log(text);
        break;
      case "ins":
        this.log(this.fmt("green", text));
        break;
      case "del":
        this.log(this.fmt("red", text));
        break;
      default:
        throw TypeError(`diff: invalid type '${edit.type}'`);
    }
  }

  private printDiffHunk(hunk: Hunk) {
    this.log(this.fmt("cyan", hunk.header()));
    hunk.edits.forEach((e) => {
      this.printDiffEdit(e);
    });
  }

  private short(oid: OID) {
    return this.repo.database.shortOid(oid);
  }
}
