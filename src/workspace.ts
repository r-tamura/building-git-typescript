import * as path from "path";
import { FileService, defaultFs, rmrf } from "./services";
import { Pathname } from "./types";
import { BaseError, asserts } from "./util";
import { Stats } from "fs";
import { Migration, Changes } from "./repository";
import { O_WRONLY, O_CREAT, O_EXCL } from "constants";

export type Environment = {
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

  async applyMigration(migration: Migration): Promise<void> {
    await this.applyChangeList(migration, "delete");

    // サブディレクトリから削除していく
    // @example
    //   rmdir a/b
    //   rmdir a
    const reversed = Array.from(migration.rmdirs).sort().reverse();
    for (const dir of reversed) {
      await this.removeDirectory(dir);
    }

    // 親ディレクトリから作成していく
    // @example
    //   mkdir a
    //   mkdir a/b
    const sorted = Array.from(migration.mkdirs).sort();
    for (const dir of sorted) {
      await this.makeDirectory(dir);
    }
    await this.applyChangeList(migration, "update");
    await this.applyChangeList(migration, "create");
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

  async readFile(pathname: Pathname) {
    return this.#fs.readFile(this.join(pathname), "ascii").catch((e: NodeJS.ErrnoException) => {
      if (e.code === "EACCES") {
        throw new NoPermission(`open('${pathname}'): Permission denied`);
      }
      throw e;
    });
  }

  async writeFile(pathname: Pathname, data: string | Buffer) {
    return this.#fs.writeFile(this.join(pathname), data);
  }

  async statFile(rpath: Pathname) {
    const handleError = (e: NodeJS.ErrnoException) => {
      switch (e.code) {
        case "ENOENT":
        case "ENOTDIR":
          return null;
        case "EACCES":
          throw new NoPermission(`stat('${rpath}'): Permission denied`);
        default:
          throw e;
      }
    };

    return this.#fs.stat(this.join(rpath)).catch(handleError);
  }

  /**
   * ワークスペースないのファイルを削除します。指定されたファイルが存在しない場合は、何もしません。
   * @param pathname 削除対象ファイルのワークスペースパスからの相対 パス
   */
  async remove(pathname: Pathname) {
    try {
      await this.#fs.unlink(path.join(this.#pathname, pathname));
    } catch (e) {
      const nodeErr = e as NodeJS.ErrnoException;
      if (nodeErr.code === "ENOENT") {
        return;
      }
      throw e;
    }
  }

  private async applyChangeList(migration: Migration, action: keyof Changes) {
    for (const [filename, entry] of migration.changes[action]) {
      const pathname = this.join(filename);
      await rmrf(this.#fs, pathname);
      if (action === "delete") {
        continue;
      }

      asserts(entry !== null, ":update, :createのときは必ずエントリが存在する");

      const flags = O_WRONLY | O_CREAT | O_EXCL;
      const data = await migration.blobData(entry.oid);
      await this.#fs.writeFile(pathname, data, { flag: flags });
      await this.#fs.chmod(pathname, entry.mode);
    }
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
          throw new MissingFile(`pathspec '${relavtive}' did not match any files`);
        default:
          throw e;
      }
    }
  }

  private async removeDirectory(dirname: Pathname) {
    // ディレクトリの存在、空であるかは考えずにrmdirを試み
    // エラーであれば何もしない
    return this.#fs.rmdir(this.join(dirname)).catch((e: NodeJS.ErrnoException) => {
      switch (e.code) {
        case "ENOENT":
        case "ENOTDIR":
        case "ENOTEMPTY":
          return;
        default:
          throw e;
      }
    });
  }

  private async makeDirectory(dirname: Pathname) {
    const pathname = path.join(this.#pathname, dirname);
    const stat = await this.statFile(dirname);

    // ファイルからディレクトリへ変更されたエントリは
    // ファイルを削除してからディレクトリを作成する
    if (stat?.isFile()) {
      await this.#fs.unlink(pathname);
    }

    if (!stat?.isDirectory()) {
      await this.#fs.mkdir(pathname);
    }
  }
}
