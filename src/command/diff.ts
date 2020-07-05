import * as arg from "arg";
import { Stage } from "../gindex";
  stage?: Stage;
      "--base": arg.flag(() => {
        this.options.stage = 1;
      }),
      "--ours": arg.flag(() => {
        this.options.stage = 2;
      }),
      "--theirs": arg.flag(() => {
        this.options.stage = 3;
      }),
          const targetFromIndex = await this.fromIndex(pathname);
          asserts(targetFromIndex !== null, `ファイル '${pathname}' は存在する`);
          this.printDiff(this.fromNothing(pathname), targetFromIndex);
          const targetFromIndex = await this.fromIndex(pathname);
          asserts(targetFromIndex !== null, `ファイル '${pathname}' は存在する`);
          this.printDiff(await this.fromHead(pathname), targetFromIndex);
          this.printDiff(await this.fromHead(pathname), this.fromNothing(pathname));
    const paths = [...this.#status.conflicts.keys(), ...this.#status.workspaceChanges.keys()];

    for (const pathname of paths.sort()) {
      if (this.#status.conflicts.has(pathname)) {
        await this.printConflictDiff(pathname);
      } else {
        await this.printWorkspaceDiff(pathname);
    return Target.of(pathname, entry.oid, entry.mode.toString(8), blob.data.toString());
  private async fromIndex(pathname: Pathname, stage: Stage = 0) {
    const entry = this.repo.index.entryForPath(pathname, stage);
    if (!entry) {
      return null;
    }
    return Target.of(entry.name, entry.oid, entry.mode.toString(8), blob.data.toString());
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
