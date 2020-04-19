import { Environment, Pathname } from "../types";
import * as Database from "../database";
import { asserts, stripIndent, asyncForEach } from "../util";
import { LockDenied } from "../refs";
import { MissingFile, NoPermission } from "../workspace";
import { Base } from "./base";

const LOCKED_INDEX_MESSAGE = `Another jit process seems to be running in this repository.
Please make sure all processes are terminated then try again.
If it still fails, a jit process may have crached in this
repository earlier: remove the file manually to continue.`;

export class Add extends Base {
  constructor(args: string[], env: Environment) {
    super(args, env);
  }

  async run() {
    try {
      await this.repo.index.loadForUpdate();
      const pathnames = await this.expandedPaths();
      await asyncForEach(this.addToIndex.bind(this), pathnames);
      await this.repo.index.writeUpdates();
    } catch (e) {
      switch ((e as Error).constructor) {
        case LockDenied:
          await this.handleLockedIndex(e);
          break;
        case NoPermission:
          await this.handleUnreadableFile(e);
          break;
        case MissingFile:
          await this.handleMissingFile(e);
          break;
        default:
          throw e;
      }
    }
  }

  private async addToIndex(pathname: Pathname) {
    const data = await this.repo.workspace.readFile(pathname);
    const stat = await this.repo.workspace.statFile(pathname);

    const blob = new Database.Blob(data);
    await this.repo.database.store(blob);
    asserts(typeof blob.oid === "string");
    this.repo.index.add(pathname, blob.oid, stat);
  }

  private async expandedPaths() {
    const entryPaths = this.args;
    const pathnameslist = await Promise.all(
      entryPaths.map((entryPath) => {
        const absPath = this.expeandedPathname(entryPath);
        return this.repo.workspace.listFiles(absPath);
      })
    );
    const pathnames = pathnameslist.flat();
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
