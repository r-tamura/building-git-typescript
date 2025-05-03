import * as Database from "../database";
import { LockDenied } from "../refs";
import { Environment } from "../types";
import { asserts, stripIndent } from "../util";
import { posixPath, PosixPath } from "../util/fs";
import { MissingFile, NoPermission } from "../workspace";
import { BaseCommand } from "./base";

const LOCKED_INDEX_MESSAGE = `Another jit process seems to be running in this repository.
Please make sure all processes are terminated then try again.
If it still fails, a jit process may have crached in this
repository earlier: remove the file manually to continue.`;

export class Add extends BaseCommand {
  constructor(args: string[], env: Environment) {
    super(args, env);
  }

  async run() {
    try {
      await this.repo.index.loadForUpdate();
      const pathnames = await this.expandedPaths();
      for (const pathname of pathnames) {
        await this.addToIndex(pathname);
      }
      await this.repo.index.writeUpdates();
    } catch (e) {
      switch ((e as Error).constructor) {
        case LockDenied:
          asserts(e instanceof LockDenied);
          await this.handleLockedIndex(e);
          break;
        case NoPermission:
          asserts(e instanceof NoPermission);
          await this.handleUnreadableFile(e);
          break;
        case MissingFile:
          asserts(e instanceof MissingFile);
          await this.handleMissingFile(e);
          break;
        default:
          throw e;
      }
    }
  }

  private async addToIndex(pathname: PosixPath) {
    console.warn(`add ${pathname}`);
    const data = await this.repo.workspace.readFile(pathname);
    const stat = await this.repo.workspace.statFile(pathname);

    const blob = new Database.Blob(data);
    await this.repo.database.store(blob);
    asserts(typeof blob.oid === "string");
    asserts(stat !== null);
    this.repo.index.add(pathname, blob.oid, stat);
  }

  private async expandedPaths(): Promise<PosixPath[]> {
    const entryPaths = this.args.map(posixPath);
    const pathNames = await Promise.all(
      entryPaths.map((entryPath) => {
        const absPath = this.expandPathnamePosix(entryPath);
        return this.repo.workspace.listFiles(absPath);
      }),
    );
    const pathnames = pathNames.flat().map((p) => posixPath(p));
    return pathnames;
  }

  private async handleLockedIndex(e: LockDenied) {
    this.logger.error(stripIndent`
    fatal: ${e.message}

    ${LOCKED_INDEX_MESSAGE}`);
    this.exit(128);
  }

  private async handleMissingFile(e: MissingFile) {
    this.logger.error(`fatal: ${e.message}`);
    await this.repo.index.releaseLock();
    this.exit(128);
  }

  private async handleUnreadableFile(e: NoPermission) {
    this.logger.error(stripIndent`
    error: ${e.message}
    fatal: adding files failed
  `);
    await this.repo.index.releaseLock();
    this.exit(128);
  }
}
