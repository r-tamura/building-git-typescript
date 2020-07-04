import * as arg from "arg";
import { Base } from "./base";
import { InvalidBranch, SymRef } from "../refs";
import { InvalidObject, Revision } from "../revision";
import { asserts, BaseError } from "../util";
import { shallowEqual } from "../util/object";

interface Option {
  verbose: boolean;
  delete: boolean;
  force: boolean;
}

export class Branch extends Base<Option> {
  async run() {
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
      verbose: false,
      delete: false,
      force: false,
    };
  }

  defineSpec() {
    return {
      "--verbose": arg.flag(() => {
        this.options.verbose = true;
      }),
      "--delete": arg.flag(() => {
        this.options.delete = true;
      }),
      "--force": arg.flag(() => {
        this.options.force = true;
      }),
      "-D": arg.flag(() => {
        this.options.delete = this.options.force = true;
      }),
      "-v": "--verbose",
      "-d": "--delete",
      "-f": "--force",
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
      return;
    }

    const oid = await this.repo.refs.deleteBranch(branchName).catch((e: BaseError) => {
      switch (e.constructor) {
        case InvalidBranch:
          this.logger.error(`error: ${e.message}`);
          this.exit(1);
        default:
          throw e;
      }
    });
    const short = this.repo.database.shortOid(oid);

    this.log(`Deleted branch ${branchName} (was ${short})`);
  }

  private async listBranches() {
    const ascending = (s1: SymRef, s2: SymRef) => s1.ord(s2);
    const current = await this.repo.refs.currentRef();
    const branches = await this.repo.refs
      .listBranchs()
      .then((branches) => branches.sort(ascending));

    const maxWidth = Math.max(...branches.map((b) => b.shortName().length));

    this.setupPager();

    for (const ref of branches) {
      let info = this.formatRef(ref, current);
      info += await this.extendedBranchInfo(ref, maxWidth);
      this.log(info);
    }
  }

  private formatRef(ref: SymRef, current: SymRef) {
    return shallowEqual(ref, current)
      ? `* ${this.fmt("green", ref.shortName())}`
      : `  ${ref.shortName()}`;
  }

  private async extendedBranchInfo(ref: SymRef, maxWidth: number) {
    if (!this.options.verbose) {
      return "";
    }
    const oid = await ref.readOid();
    asserts(oid !== null);
    const commit = await this.repo.database.load(oid);
    asserts(commit.type === "commit");
    const short = this.repo.database.shortOid(commit.oid);
    const space = " ".repeat(maxWidth - ref.shortName().length);
    return `${space} ${short} ${commit.titleLine()}`;
  }
}
