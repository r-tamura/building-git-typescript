import { Base } from "./base";
import { InvalidBranch } from "../refs";
import { InvalidObject, Revision } from "../revision";
import { asserts } from "../util";

export class Branch extends Base {
  async run() {
    await this.createBranch();
  }

  private async createBranch() {
    const [branchName, startPoint] = this.args;
    try {
      let resolved;
      if (startPoint) {
        const revision = new Revision(this.repo, startPoint);
        resolved = await revision.resolve();
      } else {
        resolved = await this.repo.refs.readHead();
        asserts(resolved !== null);
      }

      await this.repo.refs.createBranch(branchName, resolved);
    } catch (e) {
      const err = e as Error;
      switch (err.constructor) {
        case InvalidBranch:
        case InvalidObject:
          this.logger.error(`fatal: ${err.message}`);
          this.exit(128);
          break;
        default:
          throw e;
      }
    }
  }
}
