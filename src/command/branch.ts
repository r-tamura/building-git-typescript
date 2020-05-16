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
    let resolved;
    let revision;
    try {
      if (startPoint) {
        revision = new Revision(this.repo, startPoint);
        resolved = await revision.resolve("commit");
      } else {
        resolved = await this.repo.refs.readHead();
        asserts(resolved !== null);
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
}
