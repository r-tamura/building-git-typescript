import * as arg from "arg";
import * as Database from "../database";
import * as Index from "../gindex";
import { Stage, STAGES } from "../gindex";
import * as Repository from "../repository";
import { asserts } from "../util";
import { PosixPath } from "../util/fs";
import { BaseCommand } from "./base";
import {
  definePrintDiffOptions,
  NULL_OID,
  printCombinedDiff,
  printDiff,
  Target,
} from "./shared/print_diff";

interface Options {
  cached: boolean;
  patch: boolean;
  stage?: Stage;
}

export class Diff extends BaseCommand<Options> {
  #status!: Repository.Status;
  async run(): Promise<void> {
    await this.repo.index.load();
    this.#status = await this.repo.status();

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
      "-1": "--base",
      "--ours": arg.flag(() => {
        this.options.stage = 2;
      }),
      "-2": "--ours",
      "--theirs": arg.flag(() => {
        this.options.stage = 3;
      }),
      "-3": "--theirs",
      ...printDiffOptions,
    };
  }

  private async diffHeadIndex() {
    if (!this.options.patch) {
      return;
    }
    for (const [pathname, state] of this.#status.indexChanges.entries()) {
      const posixPathname = pathname as PosixPath;
      switch (state) {
        case "added": {
          const targetFromIndex = await this.fromIndex(posixPathname);
          asserts(
            targetFromIndex !== null,
            `ファイル '${posixPathname}' は存在する`,
          );
          await printDiff(this.fromNothing(posixPathname), targetFromIndex, this);
          break;
        }
        case "modified": {
          const targetFromIndex = await this.fromIndex(posixPathname);
          asserts(
            targetFromIndex !== null,
            `ファイル '${posixPathname}' は存在する`,
          );
          await printDiff(await this.fromHead(posixPathname), targetFromIndex, this);
          break;
        }
        case "deleted": {
          await printDiff(
            await this.fromHead(posixPathname),
            this.fromNothing(posixPathname),
            this,
          );
          break;
        }
      }
    }
  }

  private async diffIndexWorkspace() {
    if (!this.options.patch) {
      return;
    }

    const paths = [
      ...this.#status.conflicts.keys(),
      ...this.#status.workspaceChanges.keys(),
    ];

    for (const pathname of paths.sort()) {
      const posixPathname = pathname as PosixPath;
      if (this.#status.conflicts.has(pathname)) {
        await this.printConflictDiff(posixPathname);
      } else {
        await this.printWorkspaceDiff(posixPathname);
      }
    }
  }

  private async fromHead(pathname: PosixPath) {
    const entry = this.#status.headTree[pathname];
    const blob = await this.repo.database.load(entry.oid);
    asserts(blob instanceof Database.Blob);
    return Target.of(
      pathname,
      entry.oid,
      entry.mode.toString(8),
      blob.data.toString(),
    );
  }

  private async fromIndex(pathname: PosixPath, stage: Stage = 0) {
    const entry = this.repo.index.entryForPath(pathname, stage);
    if (!entry) {
      return null;
    }
    const blob = await this.repo.database.load(entry.oid);
    asserts(blob instanceof Database.Blob);
    return Target.of(
      entry.name,
      entry.oid,
      entry.mode.toString(8),
      blob.data.toString(),
    );
  }

  private async fromFile(pathname: PosixPath) {
    const content = await this.repo.workspace.readFile(pathname);
    const blob = new Database.Blob(content);
    const oid = this.repo.database.hashObject(blob);
    const mode = Index.Entry.modeForStat(this.#status.stats[pathname]);
    return Target.of(pathname, oid, mode.toString(8), blob.data.toString());
  }

  private fromNothing(pathname: PosixPath) {
    return Target.of(pathname, NULL_OID, null, "");
  }

  private async printConflictDiff(pathname: PosixPath) {
    const targets = [];
    for await (const target of STAGES.map((stage) =>
      this.fromIndex(pathname, stage),
    )) {
      targets.push(target);
    }
    const left = targets[2];
    const right = targets[3];

    if (this.options["stage"]) {
      this.log(`* Unmerged path ${pathname}`);
      const index = targets[this.options["stage"]];
      // TODO: indexはnullでないとは保証されていない(?) jitコマンドの挙動を調べる
      asserts(index !== null);
      const file = await this.fromFile(pathname);
      await printDiff(index, file, this);
    } else if (left && right) {
      const file = await this.fromFile(pathname);
      await printCombinedDiff([left, right], file, this);
    } else {
      this.log(`* Unmerged path ${pathname}`);
    }
  }

  private async printWorkspaceDiff(pathname: PosixPath) {
    switch (this.#status.workspaceChanges.get(pathname)) {
      case "modified": {
        const targetFromIndex = await this.fromIndex(pathname);
        asserts(targetFromIndex !== null, `ファイル '${pathname}' は存在する`);
        await printDiff(targetFromIndex, await this.fromFile(pathname), this);
        break;
      }
      case "deleted": {
        const targetFromIndex = await this.fromIndex(pathname);
        asserts(targetFromIndex !== null, `ファイル '${pathname}' は存在する`);
        await printDiff(targetFromIndex, this.fromNothing(pathname), this);
        break;
      }
    }
  }
}
