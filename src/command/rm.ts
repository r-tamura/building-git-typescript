import { Pathname } from "../types";
import { Base } from "./base";

export class Rm extends Base {
  async run() {
    await this.repo.index.load();
    for (const pathname of this.args) {
      await this.removeFile(pathname);
    }
    await this.repo.index.writeUpdates();
  }

  private async removeFile(pathname: Pathname) {
    await this.repo.index.remove(pathname);
    await this.repo.workspace.remove(pathname);
    this.log(`rm '${pathname}'`);
  }
}
