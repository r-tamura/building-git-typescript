import * as path from "path";
import { FileService, defaultFs } from "./services";
import { Pathname } from "./types";
import { BaseError, asyncMap } from "./util";
import { Stats } from "fs";

type Environment = {
  fs?: FileService;
};

export class MissingFile extends BaseError {}
export class NoPermission extends BaseError {}

export class Workspace {
  #IGNORE = [".", "..", ".git"];
  #pathname: string;
  #fs: FileService;

  constructor(pathname: string, env: Environment = {}) {
    this.#pathname = pathname;
    this.#fs = env.fs ?? defaultFs;
  }

  async listDir(dirname: Pathname = "") {
    const pathname = path.join(this.#pathname, dirname);
    const entries = await this.#fs
      .readdir(pathname)
      .then((names) => names.filter((name) => !this.#IGNORE.includes(name)));

    const stats: { [s: string]: Stats } = {};
    for (const name of entries) {
      const absPath = path.join(pathname, name);
      const relativeFromRoot = path.relative(this.#pathname, absPath);
      stats[relativeFromRoot] = await this.#fs.stat(absPath);
    }
    return stats;
  }

  async listFiles(pathname: Pathname = this.#pathname): Promise<string[]> {
    if (await this.isDirectory(pathname)) {
      const names = await this.#fs
        .readdir(pathname)
        .then((names) => names.filter((name) => !this.#IGNORE.includes(name)));

      // TODO: flatMapで置き換えられないか?
      const promises: Promise<string[]>[] = names.map(async (name) => {
        const pathFromRoot = path.join(pathname, name);
        const isDir = await this.isDirectory(pathFromRoot);
        if (isDir) {
          const names = await this.listFiles(pathFromRoot);
          return names;
        }
        return [path.relative(this.#pathname, pathFromRoot)];
      });
      const all = await Promise.all(promises);
      return all.flat();
    } else {
      return [path.relative(this.#pathname, pathname)];
    }
  }

  async readFile(rpath: string) {
    return this.#fs
      .readFile(this.join(rpath), "ascii")
      .catch((e: NodeJS.ErrnoException) => {
        if (e.code === "EACCES") {
          throw new NoPermission(`open('${rpath}'): Permission denied`);
        }
        throw e;
      });
  }

  async statFile(rpath: string) {
    return this.#fs.stat(this.join(rpath)).catch((e: NodeJS.ErrnoException) => {
      if (e.code === "EACCES") {
        throw new NoPermission(`stat('${rpath}'): Permission denied`);
      }
      throw e;
    });
  }

  private join(rpath: string) {
    return path.join(this.#pathname, rpath);
  }

  private async isDirectory(pathname: Pathname) {
    const relavtive = path.relative(this.#pathname, pathname);
    try {
      return (await this.#fs.stat(pathname)).isDirectory();
    } catch (e) {
      switch (e.code) {
        case "ENOENT":
          throw new MissingFile(
            `pathspec '${relavtive}' did not match any files`
          );
        default:
          throw e;
      }
    }
  }
}
