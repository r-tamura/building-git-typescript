import * as path from "path";
import { Base } from "./base";
import { Pathname } from "../types";
import { Stats } from "fs";

export class Status extends Base {
  #untracked!: Set<Pathname>;
  async run() {
    await this.repo.index.load();

    this.#untracked = new Set();

    await this.scanWorkspace();

    Array.from(this.#untracked)
      .sort()
      .forEach((pathname) => {
        this.log(`?? ${pathname}`);
      });
  }

  private async scanWorkspace(prefix?: string) {
    const entries = await this.repo.workspace.listDir(prefix);
    for (const [pathname, stat] of Object.entries(entries)) {
      if (this.repo.index.tracked(pathname)) {
        if (stat.isDirectory()) {
          await this.scanWorkspace(pathname);
        }
      } else if (await this.trackableFile(pathname, stat)) {
        const outputName = stat.isDirectory() ? pathname + path.sep : pathname;
        this.#untracked.add(outputName);
      }
    }
  }

  private async trackableFile(pathname: Pathname, stat: Stats) {
    if (stat.isFile()) {
      return !this.repo.index.tracked(pathname);
    }
    if (!stat.isDirectory()) {
      return false;
    }

    const entries = await this.repo.workspace.listDir(pathname);

    const files = Object.entries(entries).filter(([p, stat]) => stat.isFile());
    const dirs = Object.entries(entries).filter(([p, stat]) =>
      stat.isDirectory()
    );

    for (const map of [files, dirs]) {
      for (const [p, s] of map) {
        const res = await this.trackableFile(p, s);
        if (res) {
          return true;
        }
      }
    }
    return false;
  }
}
