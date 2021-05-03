import * as arg from "arg";
import * as refs from "../refs";
import { InvalidBranch, SymRef } from "../refs";
import * as remotes from "../remotes";
import { InvalidObject, Revision } from "../revision";
import { asserts, BaseError } from "../util";
import * as arrayUtil from "../util/array";
import { shallowEqual } from "../util/object";
import { Base } from "./base";
import * as fast_forward from "./shared/fast_forward";

interface Options {
  verbose: number;
  delete: boolean;
  force: boolean;
  /** ローカル/リモートのブランチを出力します */
  all: boolean;
  /** リモートブランチのみを出力します */
  remotes: boolean;
  track: boolean;
  upstream?: string;
}

const UNSET = ":unset";

export class Branch extends Base<Options> {
  async run() {
    if (this.options["upstream"]) {
      await this.setUpstreamBranch();
    }
    if (this.options.delete) {
      await this.deleteBranches();
    } else if (this.args.length === 0) {
      await this.listBranches();
    } else {
      await this.createBranch();
    }
  }

  initOptions() {
    this.options = {
      verbose: 0,
      delete: false,
      force: false,
      all: false,
      remotes: false,
      track: false,
    };
  }

  defineSpec(): arg.Spec {
    return {
      "--verbose": arg.flag(() => {
        this.options["verbose"] += 1;
      }),
      "--delete": arg.flag(() => {
        this.options.delete = true;
      }),
      "--force": arg.flag(() => {
        this.options.force = true;
      }),
      "--all": arg.flag(() => {
        this.options["all"] = true;
      }),
      "--remotes": arg.flag(() => {
        this.options["remotes"] = true;
      }),
      "-D": arg.flag(() => {
        this.options.delete = this.options.force = true;
      }),
      "--set-upstream-to": (upstream) => {
        this.options["upstream"] = upstream;
      },
      "--track": arg.flag(() => {
        this.options["track"] = true;
      }),
      "--unset-upstream": arg.flag(() => {
        this.options["upstream"] = UNSET;
      }),
      "-v": "--verbose",
      "-d": "--delete",
      "-f": "--force",
      "-a": "--all",
      "-r": "--remotes",
      "-u": "--set-upstream-to",
    };
  }

  private async createBranch() {
    const [branchName, startPoint] = this.args;
    let resolved;
    let revision;
    try {
      if (startPoint) {
        revision = new Revision(this.repo, startPoint);
        resolved = await revision.resolve("commit");
      } else {
        resolved = await this.repo.refs.readHead();
        if (resolved === null) {
          throw new InvalidBranch(`Not a valid object name: '${branchName}'.`);
        }
      }
      await this.repo.refs.createBranch(branchName, resolved);
      if (this.options["track"]) {
        await this.setUpstream(branchName, startPoint);
      }
    } catch (e) {
      const err = e as Error;
      switch (err.constructor) {
        case InvalidBranch:
          this.logger.error(`fatal: ${err.message}`);
          this.exit(128);
          break;
        case InvalidObject:
          revision?.errors.forEach((e) => {
            this.logger.error(`error: ${e.message}`);
            e.hint.forEach((line) => {
              this.logger.error(`hint: ${line}`);
            });
          });
          this.logger.error(`fatal: ${err.message}`);
          this.exit(128);
          break;
        default:
          throw e;
      }
    }
  }

  private async deleteBranches() {
    for (const branch of this.args) {
      await this.deleteBranch(branch);
    }
  }

  private async deleteBranch(branchName: string) {
    if (!this.options.force) {
      await this.checkMergeStatus(branchName);
    }

    const oid = await this.repo.refs
      .deleteBranch(branchName)
      .catch((e: BaseError) => {
        switch (e.constructor) {
          case InvalidBranch:
            this.logger.error(`error: ${e.message}`);
            this.exit(1);
          // eslint-disable-next-line: no-fallthrough
          default:
            throw e;
        }
      });
    const short = this.repo.database.shortOid(oid);

    this.log(`Deleted branch ${branchName} (was ${short}).`);
  }

  private async checkMergeStatus(
    branchName: string,
  ): Promise<never | undefined> {
    const upstream = await this.repo.remotes.getUpstream(branchName);
    const headOid = upstream
      ? await this.repo.refs.readRef(upstream)
      : await this.repo.refs.readHead();
    const branchOid = await this.repo.refs.readRef(branchName);

    // TODO: fix: null/undefined統合
    if (
      await fast_forward.fastForwardError(
        this,
        branchOid ?? undefined,
        headOid ?? undefined,
      )
    ) {
      this.logger.error(
        `error: The branch '${branchName}' is not fully merged.`,
      );
      this.exit(1);
    }

    return undefined;
  }

  private async listBranches() {
    const ascending = (s1: SymRef, s2: SymRef) => s1.ord(s2);
    const current = await this.repo.refs.currentRef();
    const branches = await this.branchRefs().then((branches) =>
      branches.sort(ascending),
    );

    const maxWidth = Math.max(...branches.map((b) => b.shortName().length));

    this.setupPager();

    for (const ref of branches) {
      let info = this.formatRef(ref, current);
      info += await this.extendedBranchInfo(ref, maxWidth);
      this.log(info);
    }
  }

  private async branchRefs(): Promise<SymRef[]> {
    const branches = await this.repo.refs.listBranchs();
    const remotes = await this.repo.refs.listRemotes();

    if (this.options["all"]) {
      return [...branches, ...remotes];
    }

    if (this.options["remotes"]) {
      return remotes;
    }

    return branches;
  }

  private formatRef(ref: SymRef, current: SymRef) {
    return shallowEqual(ref, current)
      ? `* ${this.fmt("green", ref.shortName())}`
      : ref.remote()
      ? `* ${this.fmt("green", ref.shortName())}`
      : `  ${ref.shortName()}`;
  }

  private async extendedBranchInfo(ref: SymRef, maxWidth: number) {
    if (this.options["verbose"] === 0) {
      return "";
    }
    const oid = await ref.readOid();
    asserts(oid !== null);
    const commit = await this.repo.database.load(oid);
    asserts(commit.type === "commit");
    const short = this.repo.database.shortOid(commit.oid);
    const space = " ".repeat(maxWidth - ref.shortName().length);
    const upstream = await this.upstreamInfo(ref);
    return `${space} ${short}${upstream} ${commit.titleLine()}`;
  }

  private async upstreamInfo(ref: SymRef): Promise<string> {
    const divergence = await this.repo.divergence(ref);
    if (divergence?.upstream === undefined) {
      return "";
    }

    const ahead = divergence.ahead;
    const behind = divergence.behind;
    const info = [] as string[];
    if (this.options["verbose"] > 1) {
      info.push(
        this.fmt("blue", this.repo.refs.shortName(divergence.upstream)),
      );
    }
    if (ahead > 0) {
      info.push(`ahead ${ahead.toString()}`);
    }
    if (behind > 0) {
      info.push(`behind ${behind.toString()}`);
    }
    return arrayUtil.isempty(info) ? "" : ` [${info.join(", ")}]`;
  }

  private async setUpstreamBranch() {
    asserts(this.options["upstream"] !== undefined);
    const branchName =
      arrayUtil.first(this.args) ??
      (await this.repo.refs.currentRef()).shortName();

    if (this.options["upstream"] === UNSET) {
      await this.repo.remotes.unsetUpstream(branchName);
    } else {
      await this.setUpstream(branchName, this.options["upstream"]);
    }
  }

  private async setUpstream(
    branchName: string,
    upstream: string,
  ): Promise<void> {
    try {
      const upstreamLong = await this.repo.refs.longName(upstream);
      const [remote, ref] = await this.repo.remotes.setUpstream(
        branchName,
        upstreamLong,
      );
      const base = this.repo.refs.shortName(ref);

      this.log(
        `Branch '${branchName}' set up to track remote branch '${base}' from '${remote}'`,
      );
    } catch (e) {
      if (e instanceof refs.InvalidBranch) {
        this.logger.error(`error: ${e.message}`);
        this.exit(1);
      }

      if (e instanceof remotes.InvalidBranch) {
        this.logger.error(`fatal: ${e.message}`);
        this.exit(128);
      }
    }
  }
}
