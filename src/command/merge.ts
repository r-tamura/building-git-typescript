import { Base } from "./base";
import { writeCommit } from "./shared/write_commit";
import { Revision } from "../revision";
import { Base as MergeBase } from "../merge";
import { asserts, first } from "../util";
import { readTextStream } from "../services";

export class Merge extends Base {
  async run() {
    const headOid = await this.repo.refs.readHead();
    asserts(headOid !== null);
    const revision = new Revision(this.repo, this.args[0]);
    const mergeOid = await revision.resolve("commit");

    const common = await MergeBase.of(this.repo.database, headOid, mergeOid);
    const baseOid = first(await common.find());

    await this.repo.index.loadForUpdate();

    const treeDiff = await this.repo.database.treeDiff(baseOid, mergeOid);
    const migration = this.repo.migration(treeDiff);
    await migration.applyChanges();

    await this.repo.index.writeUpdates();

    const message = await readTextStream(this.env.process.stdin);
    await writeCommit([headOid, mergeOid], message, this);
  }
}
