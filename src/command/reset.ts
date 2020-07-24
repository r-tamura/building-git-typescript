import { HEAD, InvalidObject, Revision } from "../revision";
import { OID, Pathname } from "../types";
import { asserts } from "../util";
import { Base } from "./base";

export class Reset extends Base {
  #commitOid!: OID;

  async run() {
    await this.selectCommitId();

    await this.repo.index.loadForUpdate();
    for (const pathname of this.args) {
      await this.resetPath(pathname);
    }
    await this.repo.index.writeUpdates();
  }

  private async resetPath(pathname?: Pathname) {
    const listing = await this.repo.database.loadTreeList(this.#commitOid, pathname);

    if (pathname) {
      await this.repo.index.remove(pathname);
    }

    for (const [pathname, entry] of Object.entries(listing)) {
      this.repo.index.addFromDb(pathname, entry);
    }
  }

  private async selectCommitId() {
    const revision = this.args[0] ?? HEAD;
    try {
      this.#commitOid = await new Revision(this.repo, revision).resolve();
    } catch (e) {
      if (e instanceof InvalidObject) {
        const headOid = await this.repo.refs.readHead();
        asserts(headOid !== null, "HEADが存在する必要があります");
        this.#commitOid = headOid;
        return;
      }
      throw e;
    }
  }
}
