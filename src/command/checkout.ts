import { OID } from "../types";
import { Base } from "./base";
import { Revision, InvalidObject } from "../revision";
import { asserts } from "../util";
import { shallowEqual } from "../util/object";
import { Migration, Conflict } from "../repository";
import { SymRef } from "../refs";

const DETACHED_HEAD_MESSAGE = `You are in 'detached HEAD' state. You can look around, make experimental
changes and commit them, and you can discard any commits you make in this
state without impacting any branches by performing another checkout.

If you want to create a new branch to retain commits you create, you may
do so (now or later) by using the branch command. Example:

  jit branch <new-branch-name>
`;
export class Checkout extends Base {
  #target!: string;
  #currentOid!: OID;
  #targetOid!: OID;
  #currentRef!: SymRef;
  #newRef!: SymRef;
  async run() {
    this.#target = this.args[0];

    this.#currentRef = await this.repo.refs.currentRef();
    const currendOid = await this.#currentRef.readOid();
    asserts(currendOid !== null, "現在指しているrefのOID");
    this.#currentOid = currendOid;

    const oidOrNull = await this.repo.refs.readHead();
    asserts(oidOrNull !== null, "HEADが存在する");
    this.#currentOid = oidOrNull;

    const revision = new Revision(this.repo, this.#target);
    try {
      this.#targetOid = await revision.resolve("commit");
    } catch (e) {
      switch (e.constructor) {
        case InvalidObject:
          this.handleInvalidObject(revision, e);
        default:
          throw e;
      }
    }

    await this.repo.index.loadForUpdate();

    const treeDiff = await this.repo.database.treeDiff(this.#currentOid, this.#targetOid);
    const migration = this.repo.migration(treeDiff);
    try {
      await migration.applyChanges();
    } catch (e) {
      switch (e.constructor) {
        case Conflict:
          await this.handleMigrationConflict(migration);
          break;
        default:
          throw e;
      }
    }

    await this.repo.index.writeUpdates();
    await this.repo.refs.setHead(this.#target, this.#targetOid);
    this.#newRef = await this.repo.refs.currentRef();

    await this.printPreviousHead();
    this.printDetachmentNotice();
    await this.printNewHead();
  }

  private handleInvalidObject(revision: Revision, error: InvalidObject) {
    revision.errors.forEach((err) => {
      this.logger.error(`error: ${err.message}`);
      err.hint.forEach((line) => this.logger.error(`hint: ${line}`));
    });
    this.logger.error(`error: ${error.message}`);
  }

  private async handleMigrationConflict(migration: Migration) {
    await this.repo.index.releaseLock();
    migration.errors.forEach((message) => {
      this.logger.error(`error: ${message}`);
    });
    this.logger.error("Aborting.");
    this.exit(1);
  }

  private async printPreviousHead() {
    if (this.#currentRef.head() && this.#currentOid === this.#targetOid) {
      await this.printHeadPosition("Previous HEAD position was", this.#currentOid);
    }
  }

  private async printHeadPosition(message: string, oid: OID) {
    const commit = await this.repo.database.load(oid);
    asserts(commit.type === "commit");
    const short = this.repo.database.shortOid(commit.oid);

    this.logger.error(`${message} ${short} ${commit.titleLine()}`);
  }

  // refを参照している状態からdetached状態になるときに警告文を表示する
  private printDetachmentNotice() {
    if (this.#newRef.head() && !this.#currentRef.head()) {
      this.logger.warn(`Note: checking out '${this.#target}'.`);
      this.logger.warn("");
      this.logger.warn(DETACHED_HEAD_MESSAGE);
    }
  }

  private async printNewHead() {
    if (this.#newRef.head()) {
      await this.printHeadPosition("HEAD is now at", this.#targetOid);
    } else if (shallowEqual(this.#newRef, this.#currentRef)) {
      this.logger.error(`Already on '${this.#target}'`);
    } else {
      this.logger.error(`Switched to branch '${this.#target}'`);
    }
  }
}
