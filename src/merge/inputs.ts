import { Repository } from "../repository";
import { OID, RevisionName } from "../types";
import { Revision } from "~/revision";
import { Bases } from "./bases";

export class Inputs {
  #repo: Repository;
  leftOid!: OID;
  rightOid!: OID;
  baseOids!: OID[];
  private constructor(
    repo: Repository,
    public leftName: RevisionName,
    public rightName: RevisionName
  ) {
    this.#repo = repo;
  }

  static async of(
    repo: Repository,
    leftName: RevisionName,
    rightName: RevisionName
  ) {
    const self = new this(repo, leftName, rightName);
    self.leftOid = await self.resolveRev(leftName);
    self.rightOid = await self.resolveRev(rightName);
    const common = await Bases.of(repo.database, self.leftOid, self.rightOid);
    self.baseOids = await common.find();
    return self;
  }

  /**
   * BCAがマージ済みコミットであるかを判定します
   */
  alreadyMerged() {
    return this.baseOids.length === 1 && this.baseOids[0] === this.rightOid;
  }

  private async resolveRev(rev: RevisionName) {
    return new Revision(this.#repo, rev).resolve("commit");
  }
}
