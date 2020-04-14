import * as path from "path";
import { FileService, defaultFs } from "./services";
import { Pathname } from "./types";

type Environment = {
  fs?: FileService;
};

export class Workspace {
  #IGNORE = [".", "..", ".git"];
  #pathname: string;
  #fs: FileService;

  constructor(pathname: string, env: Environment = {}) {
    this.#pathname = pathname;
    this.#fs = env.fs ?? defaultFs;
  }

  async listFiles(pathname: string = this.#pathname): Promise<string[]> {
    if (await this.isDirectory(pathname)) {
      const names = await this.#fs
        .readdir(pathname)
        .then((names) => names.filter((name) => !this.#IGNORE.includes(name)));

      // TODO: flatMapで置き換えられないか?
      const promises: Promise<string[]>[] = names.map(async (name) => {
        const pathFromRoot = path.join(pathname, name);
        if (await this.isDirectory(pathFromRoot)) {
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
    return this.#fs.readFile(this.join(rpath), "ascii");
  }

  async statFile(rpath: string) {
    return this.#fs.stat(this.join(rpath));
  }

  private join(rpath: string) {
    return path.join(this.#pathname, rpath);
  }

  private async isDirectory(pathname: Pathname) {
    const stats = await this.#fs.stat(pathname);
    return stats.isDirectory();
  }
}
