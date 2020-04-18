import * as path from "path";
import { Runnable } from "./types";
import { Environment } from "../types";
import * as Database from "../database";
import { asserts, stripIndent } from "../util";
import { Repository } from "../repository";
import { LockDenied } from "../refs";
import { MissingFile, NoPermission } from "../workspace";
import { Base } from "./base";

export class Add extends Base {
  constructor(args: string[], env: Environment) {
    super(args, env);
  }

  async run() {
    const { logger } = this.env;
    const entryPaths = this.args;
    const rootPath = this.dir;
    const gitPath = path.join(rootPath, ".git");

    const repo = new Repository(gitPath, this.env);

    try {
      await repo.index.loadForUpdate();
    } catch (e) {
      if (e instanceof LockDenied) {
        logger.error(stripIndent`fatal: ${e.message}

        Another jit process seems to be running in this repository.
        Please make sure all processes are terminated then try again.
        If it still fails, a jit process may have crached in this
        repository earlier: remove the file manually to continue.
        `);
      } else {
        logger.error(e.stack);
      }
      this.exit(128);
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
        logger.error(`fatal: ${e.message}`);
      } else {
        logger.error(e.stack);
      }
      await repo.index.releaseLock();
      this.exit(128);
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
          logger.error(`error: ${e.message}`);
          logger.error(`fatal: adding files failed`);
        } else {
          logger.error(e.stack);
        }
        repo.index.releaseLock();
        this.exit(128);
        return; // TODO: jestで終了の方法を調べる
      }
    }

    await repo.index.writeUpdates();
  }
}
