import { Base } from "./base";
import { InvalidBranch } from "../refs";

export class Branch extends Base {
  async run() {
    await this.createBranch();
  }

  private async createBranch() {
    const branchName = this.args[0];

    try {
      await this.repo.refs.createBranch(branchName);
    } catch (e) {
      const err = e as Error;
      switch (err.constructor) {
        case InvalidBranch:
          this.logger.error(`fatal: ${err.message}`);
          this.exit(128);
          break;
        default:
          throw e;
      }
    }
  }
}
