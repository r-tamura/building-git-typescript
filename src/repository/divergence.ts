import { CommonAncestors } from "../merge";
import { SymRef } from "../refs";
import { asserts } from "../util";
import { Repository } from "./repository";

export class Divergence {
  static async of(
    repo: Repository,
    ref: SymRef,
  ): Promise<Divergence | undefined> {
    const upstream = await repo.remotes.getUpstream(ref.shortName());

    if (upstream === undefined) {
      return;
    }

    const left = await ref.readOid();
    asserts(left !== null);
    const right = await repo.refs.readRef(upstream);
    asserts(right !== null);

    const common = await CommonAncestors.of(repo.database, left, [right]);
    await common.find();

    const [ahead, behind] = common.counts();
    const divergence = new Divergence(upstream, ahead, behind);
    return divergence;
  }

  constructor(
    public upstream: string,
    public ahead: number,
    public behind: number,
  ) {}
}
