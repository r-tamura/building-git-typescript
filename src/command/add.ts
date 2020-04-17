import * as path from "path";
import { Runnable } from "./types";
import { Environment } from "../types";
import * as Database from "../database";
import { asserts, stripIndent } from "../util";
import { Repository } from "../repository";
import { LockDenied } from "../refs";
import { MissingFile, NoPermission } from "../workspace";

export class Add implements Runnable {
  constructor(private env: Environment) {}

  async run(...argv: string[]) {
    const entryPaths = argv;
    const rootPath = this.env.process.cwd();
    const gitPath = path.join(rootPath, ".git");

    const repo = new Repository(path.join(rootPath, ".git"), this.env);

    try {
      await repo.index.loadForUpdate();
    } catch (e) {
      if (e instanceof LockDenied) {
        console.error(stripIndent`fatal: ${e.message}

        Another jit process seems to be running in this repository.
        Please make sure all processes are terminated then try again.
        If it still fails, a jit process may have crached in this
        repository earlier: remove the file manually to continue.
        `);
      } else {
        console.error(e.stack);
      }
      process.exit(128);
      return; // TODO: jestで終了の方法を調べる
    }

    let pathnameslist: string[][] | null = null;
    try {
      pathnameslist = await Promise.all(
        entryPaths.map((entryPath) => {
          const absPath = path.resolve(entryPath);
          return repo.workspace.listFiles(absPath);
        })
      );
    } catch (e) {
      if (e instanceof MissingFile) {
        console.error(`fatal: ${e.message}`);
      } else {
        console.error(e.stack);
      }
      await repo.index.releaseLock();
      process.exit(128);
      return; // TODO: jestで終了の方法を調べる
    }
    asserts(pathnameslist !== null);

    const pathnames = pathnameslist.flat();

    for (const pathname of pathnames) {
      try {
        const data = await repo.workspace.readFile(pathname);
        const stat = await repo.workspace.statFile(pathname);

        const blob = new Database.Blob(data);
        await repo.database.store(blob);
        asserts(typeof blob.oid === "string");
        repo.index.add(pathname, blob.oid, stat);
      } catch (e) {
        if (e instanceof NoPermission) {
          console.error(`error: ${e.message}`);
          console.error(`fatal: adding files failed`);
        } else {
          console.error(e.stack);
        }
        repo.index.releaseLock();
        process.exit(128);
        return; // TODO: jestで終了の方法を調べる
      }
    }

    await repo.index.writeUpdates();
  }
}
