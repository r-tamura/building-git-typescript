import { OID } from "../types";
import { Base } from "./base";
import { Revision, InvalidObject } from "../revision";
import { asserts } from "../util";

export class Checkout extends Base {
  #target!: string;
  #currentOid!: OID;
  #targetOid!: OID;
  async run() {
    this.#target = this.args[0];

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

    const treeDiff = await this.repo.database.treeDiff(
      this.#currentOid,
      this.#targetOid
    );
    const migration = this.repo.migration(treeDiff);
    await migration.applyChanges();

    this.repo.index.writeUpdates();
    this.repo.refs.updateHead(this.#targetOid);
  }

  private handleInvalidObject(revision: Revision, error: InvalidObject) {
    revision.errors.forEach((err) => {
      this.logger.error(`error: ${err.message}`);
      err.hint.forEach((line) => this.logger.error(`hint: ${line}`));
    });
    this.logger.error(`error: ${error.message}`);
  }
}