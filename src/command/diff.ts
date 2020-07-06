import { Base } from "./base";
import * as Repository from "../repository";
import { Pathname } from "../types";
import * as Database from "../database";
import * as arg from "arg";
import * as Index from "../gindex";
import { asserts } from "../util";
import { definePrintDiffOptions, Target, printDiff, NULL_OID } from "./shared/print_diff";
import { Stage } from "../gindex";

interface Option {
  cached: boolean;
  patch: boolean;
  stage?: Stage;
}

export class Diff extends Base<Option> {
  #status!: Repository.Status;
  async run(): Promise<void> {
    await this.repo.index.load();
    this.#status = await this.repo.status;

    this.setupPager();

    if (this.options.cached) {
      await this.diffHeadIndex();
    } else {
      await this.diffIndexWorkspace();
    }
  }

  initOptions(): void {
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
          printDiff(this.fromNothing(pathname), targetFromIndex, this);
          break;
        }
        case "modified": {
          const targetFromIndex = await this.fromIndex(pathname);
          asserts(targetFromIndex !== null, `ファイル '${pathname}' は存在する`);
          printDiff(await this.fromHead(pathname), targetFromIndex, this);
          break;
        }
        case "deleted": {
          printDiff(await this.fromHead(pathname), this.fromNothing(pathname), this);
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

  private async printConflictDiff(pathname: Pathname) {
    this.log(`* Unmerged path ${pathname}`);

    const target = await this.fromIndex(pathname, this.options["stage"]);
    if (!target) {
      return;
    }
    printDiff(target, await this.fromFile(pathname), this);
  }

  private async printWorkspaceDiff(pathname: Pathname) {
    switch (this.#status.workspaceChanges.get(pathname)) {
      case "modified": {
        const targetFromIndex = await this.fromIndex(pathname);
        asserts(targetFromIndex !== null, `ファイル '${pathname}' は存在する`);
        printDiff(targetFromIndex, await this.fromFile(pathname), this);
        break;
      }
      case "deleted": {
        const targetFromIndex = await this.fromIndex(pathname);
        asserts(targetFromIndex !== null, `ファイル '${pathname}' は存在する`);
        printDiff(targetFromIndex, this.fromNothing(pathname), this);
        break;
      }
    }
  }
}
